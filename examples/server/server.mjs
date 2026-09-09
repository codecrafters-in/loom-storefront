/**
 * The part of a storefront that cannot run in a browser.
 *
 * Two things belong on a server and nothing else does: the payment secret and
 * the mail password. Everything else in this project runs happily in the page.
 *
 * It deliberately does not implement the catalogue, the cart or the admin API —
 * those have their own prompt (docs/INTEGRATION-PROMPT.md) and their own schema
 * (docs/DATABASE.md). This is the money and the mail, in about four hundred
 * lines, so that "works with your API" is a fact rather than a design.
 *
 *   npm install && cp .env.example .env && npm start
 *
 * Routes:
 *   POST /carts/:cartId/checkout   create a payment, per storefront mode
 *   POST /payments/verify          check the signature, place the order
 *   POST /webhooks/razorpay        the truth, when the browser closed early
 *   POST /admin/orders/:id/refunds refund, in full or in part
 *   POST /admin/notifications/test send one email to prove the wiring
 */
import http from 'node:http'
import crypto from 'node:crypto'

const env = (key, fallback = '') => process.env[key] ?? fallback
const PORT = Number(env('PORT', 8787))
const ORIGIN = env('STOREFRONT_ORIGIN', 'http://localhost:5173')
const STORE_API = env('STORE_API')
const RAZORPAY_KEY_ID = env('RAZORPAY_KEY_ID')
const RAZORPAY_KEY_SECRET = env('RAZORPAY_KEY_SECRET')
const RAZORPAY_WEBHOOK_SECRET = env('RAZORPAY_WEBHOOK_SECRET')
const ADMIN_TOKEN = env('ADMIN_TOKEN')

/* ── the rule everything else depends on ───────────────────────────────── */

/**
 * Never charge an amount the browser sent you.
 *
 * This is the one vulnerability that turns up in almost every hand-rolled
 * checkout: the page posts `{ amount: 24900 }`, the server creates a payment
 * for it, and anyone with a console open buys a coat for a penny. The amount
 * has to be derived from data the server trusts.
 *
 * So the cart is re-priced by asking the store API for it. If you have not
 * pointed `STORE_API` anywhere, this refuses rather than guessing — a checkout
 * that quietly trusts the client is worse than one that does not start.
 */
async function priceCart(cartId, token) {
  if (!STORE_API) {
    throw new HttpError(500,
      'STORE_API is not set, so this server cannot price a cart. It will not take an amount from the browser — see the comment above priceCart().',
      'no_store_api')
  }

  const res = await fetch(`${STORE_API}/carts/${encodeURIComponent(cartId)}`, {
    headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new HttpError(502, `Could not read cart ${cartId} from the store API.`, 'cart_unreadable')

  const cart = await res.json()
  const amount = cart?.total?.amount
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(422, 'That cart has no payable total.', 'empty_cart')
  }
  return { amount, currency: cart.total.currency, cart }
}

/* ── Razorpay ──────────────────────────────────────────────────────────── */

const razorpayAuth = () =>
  `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`

async function razorpay(path, { method = 'POST', body } = {}) {
  if (!RAZORPAY_KEY_SECRET) {
    throw new HttpError(500, 'RAZORPAY_KEY_SECRET is not set on this server.', 'no_key_secret')
  }
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { authorization: razorpayAuth(), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new HttpError(res.status, json?.error?.description || 'Razorpay rejected that.', 'provider_error', json)
  }
  return json
}

/**
 * `hmac(order_id|payment_id, key_secret)` must equal the signature.
 *
 * The browser reports its own success, and anything the browser reports can be
 * forged. This check is the only thing standing between a free order and a paid
 * one, which is why the verify route below refuses to place an order without
 * it — and why it compares in constant time rather than with `===`.
 */
function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')
  return timingSafeEqual(expected, razorpay_signature)
}

function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex')
  return timingSafeEqual(expected, signature)
}

/** Comparing hashes with `===` leaks their contents one character at a time. */
function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8')
  const right = Buffer.from(String(b || ''), 'utf8')
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

/* ── email ─────────────────────────────────────────────────────────────── */

/**
 * Nodemailer is loaded on demand, not imported at the top.
 *
 * The payment half of this server has no dependencies at all — HMAC is in
 * `node:crypto` and Razorpay is an HTTP API — and it should not refuse to boot
 * because the mail library is not installed yet. Email needs one `npm install`;
 * taking money does not.
 */
let mailer
async function transport() {
  if (mailer !== undefined) return mailer
  if (!env('SMTP_HOST') || !env('SMTP_PASSWORD')) return (mailer = null)
  try {
    const { default: nodemailer } = await import('nodemailer')
    const port = Number(env('SMTP_PORT', 465))
    mailer = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASSWORD') },
    })
  } catch {
    console.warn('  ! nodemailer is not installed — run `npm install` in examples/server to enable email')
    mailer = null
  }
  return mailer
}

const TEMPLATES = {
  orderPlaced: (order) => ({
    subject: `Order ${order.number} is confirmed`,
    text: [
      `Thanks — we have your order.`,
      ``,
      lines(order),
      `Total: ${formatMoney(order.total)}`,
      ``,
      `We will email again when it ships.`,
    ].join('\n'),
  }),
  paymentCaptured: (order) => ({
    subject: `Payment received for ${order.number}`,
    text: `We have received ${formatMoney(order.total)} for order ${order.number}.`,
  }),
  shipped: (order) => ({
    subject: `Order ${order.number} is on its way`,
    text: order.tracking?.code
      ? `Your order has shipped. Tracking: ${order.tracking.code}`
      : `Your order has shipped.`,
  }),
  refunded: (order, extra) => ({
    subject: `Refund for ${order.number}`,
    text: `We have refunded ${formatMoney(extra?.amount || order.total)}. It usually reaches your account in five to seven working days.`,
  }),
  cancelled: (order) => ({
    subject: `Order ${order.number} was cancelled`,
    text: `Your order has been cancelled and nothing will be charged.`,
  }),
}

const lines = (order) =>
  (order.lines || [])
    .map((l) => `  ${l.quantity} × ${l.title}${l.options ? ` (${Object.values(l.options).join(', ')})` : ''}`)
    .join('\n')

const formatMoney = (m) =>
  m ? new Intl.NumberFormat('en', { style: 'currency', currency: m.currency }).format(m.amount / 100) : ''

/**
 * Email is sent, never awaited by the payment path.
 *
 * A failing mail server must not fail a payment that already succeeded. The
 * customer has been charged; telling them the checkout broke because Gmail was
 * slow is the worst outcome available.
 */
async function notify(event, order, extra) {
  const mail = await transport()
  const template = TEMPLATES[event]
  if (!mail || !template || !order?.email) return { delivered: false, reason: 'not_configured' }

  const { subject, text } = template(order, extra)
  try {
    await mail.sendMail({
      from: env('MAIL_FROM', env('SMTP_USER')),
      replyTo: env('MAIL_REPLY_TO') || undefined,
      to: order.email,
      subject,
      text,
    })
    return { delivered: true, to: order.email, subject }
  } catch (err) {
    console.error(`[mail] ${event} to ${order.email} failed:`, err.message)
    return { delivered: false, reason: err.message }
  }
}

/* ── routes ────────────────────────────────────────────────────────────── */

const routes = []
const route = (method, pattern, handler) =>
  routes.push({ method, pattern: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler })

route('POST', '/carts/:cartId/checkout', async ({ params, body, token }) => {
  const { amount, currency } = await priceCart(params.cartId, token)

  const order = await razorpay('/orders', {
    body: {
      amount,
      currency,
      receipt: params.cartId,
      notes: { email: body.email || '', cart_id: params.cartId },
    },
  })

  return {
    razorpay_order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    // The storefront's `redirect` mode wants a url instead; Razorpay's hosted
    // payment links are created the same way if you prefer that shape.
    key_id: RAZORPAY_KEY_ID,
  }
})

route('POST', '/payments/verify', async ({ body, token }) => {
  if (!verifyPaymentSignature(body)) {
    // 400, not 402: a bad signature is a forged claim, not a declined card.
    throw new HttpError(400, 'That payment could not be verified.', 'bad_signature')
  }

  const payment = await razorpay(`/payments/${encodeURIComponent(body.razorpay_payment_id)}`, { method: 'GET' })
  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    throw new HttpError(402, `The payment is ${payment.status}.`, 'payment_not_captured')
  }

  const order = await placeOrder({
    token,
    cartId: payment.notes?.cart_id,
    email: payment.notes?.email || payment.email,
    payment: {
      provider: 'razorpay',
      status: payment.status === 'captured' ? 'captured' : 'authorized',
      reference: payment.id,
      method: payment.method,
      amount: { amount: payment.amount, currency: payment.currency },
    },
  })

  notify('orderPlaced', order)
  return order
})

/**
 * The webhook is the truth; the browser is a hint.
 *
 * A shopper who pays and closes the tab before the redirect has still paid.
 * Without this the money is taken and no order exists, which is the single
 * most common way a hand-rolled checkout loses a customer permanently.
 */
route('POST', '/webhooks/razorpay', async ({ raw, headers }) => {
  if (!RAZORPAY_WEBHOOK_SECRET) throw new HttpError(500, 'RAZORPAY_WEBHOOK_SECRET is not set.', 'no_webhook_secret')
  if (!verifyWebhookSignature(raw, headers['x-razorpay-signature'])) {
    throw new HttpError(400, 'Bad webhook signature.', 'bad_signature')
  }

  const event = JSON.parse(raw)
  const payment = event.payload?.payment?.entity

  if (event.event === 'payment.captured' && payment) {
    // Idempotent by payment id: Razorpay retries, and a retry must not place a
    // second order for the same money.
    const order = await placeOrder({
      cartId: payment.notes?.cart_id,
      email: payment.notes?.email || payment.email,
      idempotencyKey: payment.id,
      payment: {
        provider: 'razorpay',
        status: 'captured',
        reference: payment.id,
        method: payment.method,
        amount: { amount: payment.amount, currency: payment.currency },
      },
    })
    if (order?.created) notify('orderPlaced', order)
  }

  return { received: true }
})

route('POST', '/admin/orders/:id/refunds', async ({ params, body, headers }) => {
  requireAdmin(headers)
  const order = await storeApi('GET', `/admin/orders/${encodeURIComponent(params.id)}`)
  const reference = order?.payment?.reference
  if (!reference) throw new HttpError(422, 'That order has no captured payment to refund.', 'nothing_to_refund')

  const refund = await razorpay(`/payments/${encodeURIComponent(reference)}/refund`, {
    body: {
      amount: body.amount ?? undefined, // omitted means the whole thing
      notes: { reason: body.reason || '' },
      speed: 'normal',
    },
  })

  // Record it in the store, so the admin panel and the customer's order page
  // agree with the provider. The provider is the source of truth for money; the
  // store is the source of truth for what the shopper sees.
  const updated = await storeApi('POST', `/admin/orders/${encodeURIComponent(params.id)}/refunds`, {
    amount: refund.amount,
    reason: body.reason || '',
    restock: body.restock,
    reference: refund.id,
  })

  notify('refunded', updated || order, { amount: { amount: refund.amount, currency: refund.currency } })
  return updated || { ok: true, refund }
})

route('POST', '/admin/notifications/test', async ({ body, headers }) => {
  requireAdmin(headers)
  const to = body.to || env('SMTP_USER')
  if (!to) throw new HttpError(422, 'No recipient, and SMTP_USER is empty.', 'missing_to')
  if (!(await transport())) throw new HttpError(500, 'SMTP is not configured on this server.', 'no_smtp')

  const result = await notify(body.event || 'orderPlaced', {
    email: to,
    number: 'TEST-0001',
    total: { amount: 12345, currency: 'INR' },
    lines: [{ quantity: 1, title: 'A test line' }],
  })
  if (!result.delivered) throw new HttpError(502, `Could not send: ${result.reason}`, 'send_failed')
  return { delivered: true, preview: { to, subject: result.subject } }
})

/* ── the store API, as this server sees it ─────────────────────────────── */

async function storeApi(method, path, body) {
  if (!STORE_API) return null
  const res = await fetch(`${STORE_API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(ADMIN_TOKEN ? { authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new HttpError(502, `Store API ${method} ${path} returned ${res.status}.`, 'store_api_error')
  return res.json().catch(() => null)
}

const placeOrder = ({ cartId, email, payment, idempotencyKey }) =>
  storeApi('POST', '/admin/orders', { cart_id: cartId, email, payment, idempotency_key: idempotencyKey })

function requireAdmin(headers) {
  if (!ADMIN_TOKEN) throw new HttpError(500, 'ADMIN_TOKEN is not set, so admin routes are closed.', 'no_admin_token')
  const sent = String(headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!timingSafeEqual(ADMIN_TOKEN, sent)) throw new HttpError(401, 'Not authorised.', 'unauthorised')
}

/* ── plumbing ──────────────────────────────────────────────────────────── */

class HttpError extends Error {
  constructor(status, message, code, detail) {
    super(message)
    Object.assign(this, { status, code, detail })
  }
}

const server = http.createServer(async (req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'access-control-allow-origin': ORIGIN,
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-credentials': 'true',
    })
    res.end(JSON.stringify(payload))
  }

  if (req.method === 'OPTIONS') return send(204, {})

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const match = routes
    .map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.pattern) }))
    .find(({ m }) => m)

  if (!match) return send(404, { code: 'not_found', message: `No route for ${req.method} ${url.pathname}.` })

  // The webhook signature is over the exact bytes, so the raw body is kept.
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')

  let body = {}
  if (raw) {
    try {
      body = JSON.parse(raw)
    } catch {
      return send(400, { code: 'bad_json', message: 'The body was not JSON.' })
    }
  }

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const result = await match.r.handler({
      params: match.m.groups || {},
      body,
      raw,
      headers: req.headers,
      token,
    })
    return send(200, result)
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { code: err.code, message: err.message, detail: err.detail })
    console.error(err)
    return send(500, { code: 'server_error', message: 'Something went wrong on the server.' })
  }
})

server.listen(PORT, async () => {
  console.log(`payments server on http://localhost:${PORT}`)
  const warn = (condition, message) => condition && console.warn(`  ! ${message}`)
  warn(!RAZORPAY_KEY_SECRET, 'RAZORPAY_KEY_SECRET is empty — payment routes will fail')
  warn(!RAZORPAY_WEBHOOK_SECRET, 'RAZORPAY_WEBHOOK_SECRET is empty — webhooks are refused')
  warn(!STORE_API, 'STORE_API is empty — this server will not price a cart, by design')
  warn(!(await transport()), 'SMTP is not configured — no email will be sent')
  warn(!ADMIN_TOKEN, 'ADMIN_TOKEN is empty — admin routes are closed')
})
