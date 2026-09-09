import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'

/**
 * The reference payments server, run for real.
 *
 * Signature verification is the only thing standing between a free order and a
 * paid one — the browser reports its own success and anything the browser
 * reports can be forged. So it is tested against the actual process over HTTP,
 * not by importing a function and hoping the route calls it.
 */
/**
 * A port chosen per run, not a constant.
 *
 * A fixed port makes the suite fail whenever anything else is on it — which
 * happened once here, with a server left over from a manual session. A test
 * that goes red because of something outside the repository teaches everyone
 * to ignore it.
 */
const PORT = 8700 + (process.pid % 300)
const KEY_SECRET = 'test_key_secret'
const WEBHOOK_SECRET = 'test_webhook_secret'
const ADMIN_TOKEN = 'test_admin_token'
const base = `http://127.0.0.1:${PORT}`

let child

before(async () => {
  child = spawn(process.execPath, [new URL('../examples/server/server.mjs', import.meta.url).pathname], {
    env: {
      ...process.env,
      PORT: String(PORT),
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      ADMIN_TOKEN,
      STORE_API: '',
      SMTP_HOST: '',
      SMTP_PASSWORD: '',
    },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(base)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  throw new Error('the reference server did not start')
})

after(() => child?.kill())

const post = async (path, body, headers = {}) => {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const paymentSignature = (orderId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')

test('it starts with no dependencies installed', async () => {
  // The payment half is HMAC and an HTTP API, both in the standard library.
  // Refusing to boot because the mail package is missing would be absurd.
  const res = await fetch(`${base}/nope`, { method: 'POST' })
  assert.equal(res.status, 404)
})

test('a forged payment signature is refused', async () => {
  const { status, json } = await post('/payments/verify', {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: 'forged',
  })
  assert.equal(json.code, 'bad_signature')
  // 400, not 402: a bad signature is a forged claim, not a declined card.
  assert.equal(status, 400)
})

test('a signature from the wrong secret is refused', async () => {
  const { json } = await post('/payments/verify', {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: paymentSignature('order_1', 'pay_1', 'somebody_elses_secret'),
  })
  assert.equal(json.code, 'bad_signature')
})

test('a signature for a different payment is refused', async () => {
  // Replaying a real signature against a cheaper order is the obvious attack.
  const { json } = await post('/payments/verify', {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_2',
    razorpay_signature: paymentSignature('order_1', 'pay_1'),
  })
  assert.equal(json.code, 'bad_signature')
})

test('a correct signature gets past the check', async () => {
  // It then calls Razorpay, which has no such payment — the point is that the
  // signature gate opened, and did not open for any of the three above.
  const { json } = await post('/payments/verify', {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: paymentSignature('order_1', 'pay_1'),
  })
  assert.notEqual(json.code, 'bad_signature')
})

test('an unsigned webhook is refused', async () => {
  const { json } = await post('/webhooks/razorpay', { event: 'payment.captured' })
  assert.equal(json.code, 'bad_signature')
})

test('a correctly signed webhook is accepted', async () => {
  const body = JSON.stringify({ event: 'payment.authorized', payload: {} })
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  const { json } = await post('/webhooks/razorpay', body, { 'x-razorpay-signature': signature })
  assert.deepEqual(json, { received: true })
})

test('the webhook signature covers the exact bytes', async () => {
  // Signing the parsed-and-restringified body instead of the raw request is a
  // classic way to make verification pass for a payload that was tampered with.
  const body = JSON.stringify({ event: 'payment.authorized', payload: {} })
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  const tampered = JSON.stringify({ event: 'payment.authorized', payload: {}, extra: 1 })
  const { json } = await post('/webhooks/razorpay', tampered, { 'x-razorpay-signature': signature })
  assert.equal(json.code, 'bad_signature')
})

test('admin routes need the token', async () => {
  const anonymous = await post('/admin/notifications/test', {})
  assert.equal(anonymous.status, 401)

  const wrong = await post('/admin/notifications/test', {}, { authorization: 'Bearer nope' })
  assert.equal(wrong.status, 401)

  const right = await post('/admin/notifications/test', { to: 'x@example.com' }, { authorization: `Bearer ${ADMIN_TOKEN}` })
  assert.equal(right.json.code, 'no_smtp', 'the token was accepted and it failed on SMTP, as configured')
})

test('it will not price a cart from the browser', async () => {
  // The vulnerability in almost every hand-rolled checkout: the page posts an
  // amount and the server bills it. Refusing to start is the correct answer.
  const { json } = await post('/carts/cart_1/checkout', { amount: 1, email: 'x@example.com' })
  assert.equal(json.code, 'no_store_api')
})
