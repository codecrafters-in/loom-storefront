/**
 * The demo backend's admin half.
 *
 * Split out of mock.js so it loads with the first admin call rather than with
 * the shop (see the note at the end of that file). It reads and writes the same
 * state: the catalogue, the settings and the storage keys are mock.js's, shared
 * through live bindings, so a price saved here is the price the shop reads.
 */
import * as db from '../db.js'
import * as mediaStore from '../media.js'
import { attributes } from '../../data/attributes.js'
import { ApiError } from './contracts.js'
import {
  products,
  storefront,
  adopt,
  CURRENCY,
  nowIso,
  KEY,
  latency,
  read,
  write,
  money,
  id,
  storedProduct,
  listCategoriesSync,
  discounts,
  emptyCart,
  priceCart,
  loadCart,
  saveCart,
  placeOrderFromCart,
} from './mock.js'

/**
 * Place an order on behalf of a payment that has already been taken.
 *
 * This is how `examples/server/server.mjs` turns a captured Razorpay payment
 * into an order, and it existed as an undocumented dependency for a while: the
 * reference server called `POST /admin/orders` and nothing in the contract said
 * the route was meant to be there, so a backend built from the docs would 502
 * the first time somebody paid.
 *
 * **Idempotent on `idempotencyKey`.** Providers retry their webhooks, and a
 * retry must not place a second order for the same money. A replay returns the
 * original order with `created: false`, which is the flag the reference server
 * uses to decide whether to send a confirmation email — without it, every retry
 * emails the customer again.
 */
export async function adminPlaceOrder({ cartId, email, payment, idempotencyKey } = {}) {
  await latency()

  if (idempotencyKey) {
    const seen = read(KEY.idempotency, {})[idempotencyKey]
    const existing = seen && read(KEY.orders, []).find((o) => o.id === seen)
    if (existing) return { ...existing, created: false }
  }

  const cart = loadCart()
  if (!cartId || cart.id !== cartId) {
    throw new ApiError(`No cart with id "${cartId}".`, { status: 404, code: 'cart_not_found' })
  }

  const order = placeOrderFromCart(priceCart(cart), {
    email,
    shippingAddress: cart.shippingAddress,
    shippingMethod: cart.shippingMethod,
    payment,
  })

  if (idempotencyKey) {
    write(KEY.idempotency, { ...read(KEY.idempotency, {}), [idempotencyKey]: order.id })
  }
  // The lines were sold, so the bag is spent. `KEY.placed` is deliberately not
  // written: an order placed by a server on a webhook's behalf is not this
  // browser's order, and granting it the guest-confirmation capability would
  // hand the shop's own tab access to somebody else's purchase.
  saveCart(emptyCart())
  return { ...order, created: true }
}

const ORDER_STATUSES = ['placed', 'paid', 'fulfilled', 'delivered', 'cancelled', 'refunded']

/** The back-office view of an order: the stored Order plus what it needs next. */
/**
 * The back-office order helpers, loaded by the first admin call rather than
 * with the shop: a shopper browsing the demo never needs them.
 */
async function orderKit() {
  const kit = await import('../admin-orders.js')
  return { ...kit, view: (order) => kit.adminOrderView(order, { shippingMethods: storefront.commerce?.shippingMethods || [] }) }
}

const ACTION_DONE = {
  ship: 'marked as shipped',
  update_tracking: 'given tracking',
  deliver: 'marked as delivered',
  record_payment: 'marked as paid',
  cancel: 'cancelled',
}

// The old `{ status }` body. These three statuses are actions now; the rest are set as before.
const LEGACY_STATUS_ACTIONS = { fulfilled: 'ship', delivered: 'deliver', cancelled: 'cancel' }

export async function adminListOrders({ q, status, payment, delivery, page = 1, perPage = 25 } = {}) {
  await latency()
  const { view: adminView, filterOrders, orderCounts } = await orderKit()
  const views = read(KEY.orders, [])
    .map(adminView)
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
  const size = Math.min(Math.max(Number(perPage) || 25, 1), 100)
  const current = Math.max(Number(page) || 1, 1)
  const matching = filterOrders(views, { q, status, payment, delivery })
  return {
    items: matching.slice((current - 1) * size, current * size),
    total: matching.length,
    page: current,
    perPage: size,
    // Over every order, whatever the filter — they label the tabs.
    counts: orderCounts(views),
  }
}

/* ── refunds ───────────────────────────────────────────────────────────── */

/**
 * Refund some or all of an order.
 *
 * Modelled as a list rather than a flag, because a partial refund is the common
 * case — one item back from a three-item order — and a boolean cannot express
 * "refunded £40 of £120, twice, for two different reasons". The list is also
 * the only shape that reconciles against a payment provider's own records,
 * which is what anyone doing the books will actually need.
 *
 * Real money moves on the server. This records the intent and the result; the
 * reference server calls Razorpay and posts the outcome back.
 */
export async function adminRefundOrder(orderId, { amount, reason = '', restock } = {}) {
  await latency()
  const orders = read(KEY.orders, [])
  const i = orders.findIndex((o) => o.id === orderId || o.number === orderId)
  if (i < 0) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })

  const order = orders[i]
  const paid = order.total?.amount ?? 0
  const already = order.refundedTotal?.amount ?? 0
  const remaining = paid - already

  if (remaining <= 0) {
    throw new ApiError('This order is already fully refunded.', { status: 409, code: 'already_refunded' })
  }

  // Default to the rest of it, which is what "Refund" means when nobody typed
  // a number. An explicit amount is still checked — a refund larger than the
  // payment is a chargeback waiting to happen, and providers reject it anyway.
  const value = amount === undefined || amount === null ? remaining : Math.round(Number(amount))
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApiError('A refund needs a positive amount.', { status: 422, code: 'invalid_amount' })
  }
  if (value > remaining) {
    throw new ApiError(
      `That is more than the ${formatMinor(remaining)} still refundable on this order.`,
      { status: 422, code: 'amount_too_large', detail: { remaining } },
    )
  }

  const putBack = restock ?? storefront.checkout?.restockOnRefund !== false
  const full = value === remaining

  // Only a full refund restocks automatically. Guessing which line a partial
  // refund refers to would put the wrong variant back, and a phantom unit in
  // stock is worse than a missing one — it sells.
  if (putBack && full) {
    for (const line of order.lines) db.adjustInventory(line.variantId, line.quantity)
    adopt()
  }

  const refund = {
    id: id('refund'),
    amount: money(value),
    reason: reason.trim(),
    createdAt: nowIso(),
    reference: null,
    restocked: Boolean(putBack && full),
  }

  const refundedTotal = already + value
  orders[i] = {
    ...order,
    refunds: [...(order.refunds || []), refund],
    refundedTotal: money(refundedTotal),
    status: refundedTotal >= paid ? 'refunded' : order.status,
    payment: {
      ...(order.payment || {}),
      status: refundedTotal >= paid ? 'refunded' : 'partially_refunded',
    },
    updatedAt: nowIso(),
  }
  write(KEY.orders, orders)
  return orders[i]
}

const formatMinor = (amount) => `${(amount / 100).toFixed(2)} ${CURRENCY}`

/* ── notifications ─────────────────────────────────────────────────────── */

/**
 * What the store would send, and when.
 *
 * The browser cannot send email — SMTP needs a socket and an app password needs
 * somewhere to hide — so mock mode reports the message it *would* have sent
 * rather than pretending. That is more useful than a fake success: a merchant
 * checking their setup wants to see the recipient, the subject and which event
 * fired, and to be told plainly that nothing left the building.
 */
export async function adminSendTestNotification({ event = 'orderPlaced', to } = {}) {
  await latency()
  const settings = storefront.notifications || {}
  const recipient = to || settings.from

  if (settings.enabled === false) {
    throw new ApiError('Notifications are switched off in settings.', { status: 409, code: 'notifications_disabled' })
  }
  if (!recipient) {
    throw new ApiError('Set a from-address before sending a test.', { status: 422, code: 'missing_from' })
  }
  if (settings.transport === 'smtp' && !settings.smtp?.host) {
    throw new ApiError('Set an SMTP host before sending a test.', { status: 422, code: 'missing_smtp_host' })
  }

  return {
    delivered: false,
    reason: 'no_server',
    message:
      'The demo backend runs in your browser and cannot open an SMTP connection. Point VITE_DATA_SOURCE at a server — examples/server implements this — and the same call sends for real.',
    preview: {
      event,
      to: recipient,
      from: settings.from,
      replyTo: settings.replyTo || null,
      transport: settings.transport,
      subject: NOTIFICATION_SUBJECTS[event] || 'Notification',
      via: settings.transport === 'smtp' ? `${settings.smtp?.host}:${settings.smtp?.port}` : settings.endpoint,
    },
  }
}

const NOTIFICATION_SUBJECTS = {
  orderPlaced: 'Your order is confirmed',
  paymentCaptured: 'Payment received',
  shipped: 'Your order is on its way',
  refunded: 'Your refund is on its way',
  cancelled: 'Your order was cancelled',
}

/* ── credentials ───────────────────────────────────────────────────────── */

/**
 * Secrets go in, nothing comes out.
 *
 * A Razorpay `key_secret` or a Gmail app password in the storefront settings
 * would be served to every visitor by `GET /storefront`, which is not a
 * hardening question — it is the whole secret, published. So they take a
 * separate write-only path, and the read returns whether each one is set and
 * when, never the value.
 *
 * In this demo there is no server to hold one, so nothing is stored at all: the
 * marker is written and the value is dropped on the floor. That is deliberate.
 * A demo that accepts a live key is a demo that will eventually be handed one.
 */
const CREDENTIALS = ['razorpayKeySecret', 'razorpayWebhookSecret', 'smtpPassword', 'stripeSecretKey']

export async function adminGetCredentials() {
  await latency()
  const stored = read(KEY.credentials, {})
  return {
    items: CREDENTIALS.map((key) => ({
      key,
      set: Boolean(stored[key]?.set),
      updatedAt: stored[key]?.updatedAt || null,
    })),
    // The storefront is a browser app. Saying so here is what stops somebody
    // pasting a live secret into a preview and assuming it went somewhere.
    storesSecrets: false,
  }
}

export async function adminSaveCredentials(patch = {}) {
  await latency()
  const unknown = Object.keys(patch).filter((k) => !CREDENTIALS.includes(k))
  if (unknown.length) {
    throw new ApiError(`Unknown credential: ${unknown.join(', ')}.`, { status: 422, code: 'unknown_credential' })
  }

  const stored = read(KEY.credentials, {})
  for (const [key, value] of Object.entries(patch)) {
    if (!String(value || '').trim()) delete stored[key]
    else stored[key] = { set: true, updatedAt: nowIso() } // the value is not kept
  }
  write(KEY.credentials, stored)
  return adminGetCredentials()
}

/**
 * Move an order along: ship it, track it, deliver it, take the cash, or cancel.
 *
 * One action per call, and only the ones the order's `actions` list allows —
 * the same rule a real backend applies, so the demo cannot teach a flow the
 * live store would refuse.
 */
export async function adminUpdateOrder(orderId, patch = {}) {
  await latency()
  const { view: adminView, ORDER_ACTIONS, trackingProblem } = await orderKit()
  const orders = read(KEY.orders, [])
  const i = orders.findIndex((o) => o.id === orderId || o.number === orderId)
  if (i < 0) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })
  const order = orders[i]

  let action = patch.action
  if (!action && patch.status) {
    action = LEGACY_STATUS_ACTIONS[patch.status]
    if (!action) {
      if (!ORDER_STATUSES.includes(patch.status)) {
        throw new ApiError(`"${patch.status}" is not a valid status.`, { status: 422, code: 'invalid_status' })
      }
      orders[i] = { ...order, status: patch.status, updatedAt: nowIso() }
      write(KEY.orders, orders)
      return adminView(orders[i])
    }
  }
  if (!ORDER_ACTIONS.includes(action)) {
    throw new ApiError(`"${action}" is not something an order can do.`, { status: 422, code: 'invalid_action' })
  }
  if (!adminView(order).actions.includes(action)) {
    throw new ApiError(`${order.number} can't be ${ACTION_DONE[action]} right now.`, { status: 409, code: 'action_not_allowed' })
  }
  const tracking = patch.tracking || {}
  const problem = trackingProblem(tracking)
  if (problem) throw new ApiError(problem, { status: 422, code: 'invalid_tracking' })

  const now = nowIso()
  const next = { ...order, updatedAt: now }
  const applyTracking = () => {
    const current = typeof order.tracking === 'string' ? { code: order.tracking } : order.tracking || {}
    const merged = { carrier: current.carrier || '', code: current.code || '', url: current.url || '' }
    // A field left out is kept, so adding the link later does not wipe the number.
    for (const key of ['carrier', 'code', 'url']) {
      if (tracking[key] !== undefined) merged[key] = String(tracking[key] || '').trim()
    }
    next.tracking = merged.carrier || merged.code || merged.url ? merged : null
  }

  switch (action) {
    case 'ship':
      next.shippedAt = now
      next.status = 'fulfilled'
      applyTracking()
      break
    case 'update_tracking':
      applyTracking()
      break
    case 'deliver':
      next.shippedAt = order.shippedAt || now
      next.deliveredAt = now
      next.status = 'delivered'
      break
    case 'record_payment':
      next.payment = { ...order.payment, status: 'captured', capturedAt: now }
      if (order.status === 'placed') next.status = 'paid'
      break
    case 'cancel':
      // Cancelling puts the stock back. An order that vanishes without returning
      // its units is how a catalogue slowly loses inventory nobody can account for.
      for (const line of order.lines) db.adjustInventory(line.variantId, line.quantity)
      adopt()
      next.status = 'cancelled'
      next.cancelledAt = now
      if (order.payment?.status === 'pending') next.payment = { ...order.payment, status: 'cancelled' }
      break
  }

  orders[i] = next
  write(KEY.orders, orders)
  return adminView(next)
}

/**
 * One order, for an admin token.
 *
 * Deliberately not owner-scoped, unlike `getOrder` above — that one gates on
 * the customer session or on the browser that placed the order, which is
 * exactly right for a shopper and useless for a back office. The refund route
 * in `examples/server/server.mjs` reads `payment.reference` through here to
 * call the provider, so this must also never redact it.
 *
 * In this demo there is no server to check a token against, so it simply
 * returns the record — the same position `adminListProducts` takes. The
 * enforcement is the backend's, and the docs say so.
 */
export async function adminGetOrder(idOrNumber) {
  await latency()
  const { view: adminView } = await orderKit()
  const order = read(KEY.orders, []).find((o) => o.id === idOrNumber || o.number === idOrNumber)
  if (!order) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })
  return adminView(order)
}

/* ── account ───────────────────────────────────────────────────────────── */

export async function adminListProducts({ q = '', page = 1, perPage = 25 } = {}) {
  await latency()
  const needle = q.trim().toLowerCase()
  // Admin sees drafts. `listProducts` never does.
  const all = needle
    ? products.filter((p) => `${p.title} ${p.slug} ${p.tags.join(' ')}`.toLowerCase().includes(needle))
    : products
  const start = (page - 1) * perPage
  return { items: all.slice(start, start + perPage).map(storedProduct), total: all.length, page, perPage }
}

const BUILT_IN_KEYS = new Set(attributes.map((a) => a.key))

export async function adminSaveProduct(patch) {
  await latency()
  const saved = db.upsertProduct(patch)
  // Anything described here that the built-in vocabulary does not know is
  // offered on the next product. Reuse should not require deciding to save.
  db.learnFrom(saved, BUILT_IN_KEYS)
  return storedProduct(saved)
}

export async function adminDeleteProduct(idOrSlug) {
  await latency()
  return db.deleteProduct(idOrSlug)
}

export async function adminSetInventory(variantId, quantity) {
  await latency()
  const v = db.setInventory(variantId, quantity)
  if (!v) throw new ApiError('Unknown variant.', { status: 404, code: 'variant_not_found' })
  return v
}

export async function adminAdjustInventory(variantId, delta) {
  await latency()
  const v = db.adjustInventory(variantId, delta)
  if (!v) throw new ApiError('Unknown variant.', { status: 404, code: 'variant_not_found' })
  return v
}

export async function adminSaveCategory(patch) {
  await latency()
  return db.upsertCategory(patch)
}

export async function adminDeleteCategory(slug) {
  await latency()
  return db.deleteCategory(slug)
}

/** The admin tree. The local catalogue already lists every category, empty ones included. */
export async function adminListCategories() {
  await latency()
  return listCategoriesSync({ tree: true })
}

export async function adminUpdateSettings(patch) {
  await latency()
  return db.updateSettings(patch)
}

export async function adminImport(payload) {
  await latency()
  return db.importCatalog(payload)
}

export async function adminExport() {
  await latency()
  return db.exportCatalog()
}

export async function adminListDiscounts() {
  await latency()
  const items = discounts()
  return { items, total: items.length }
}

export async function adminSaveDiscount(discount) {
  await latency()
  const code = String(discount.code || '').trim().toUpperCase()
  if (!code) throw new ApiError('A code is required.', { status: 422, code: 'code_required' })
  const list = discounts().slice()
  const i = list.findIndex((d) => d.code === code)
  const next = { ...discount, code }
  if (i >= 0) list[i] = { ...list[i], ...next }
  else list.push(next)
  write(KEY.discounts, list)
  return next
}

export async function adminDeleteDiscount(code) {
  await latency()
  write(KEY.discounts, discounts().filter((d) => d.code !== code))
  return { ok: true }
}

/* ── media ─────────────────────────────────────────────────────────────── */

/**
 * Uploads go to a browser-local binary store, and the product keeps a
 * `media:<id>` reference. In api mode this posts to your endpoint instead and
 * the product keeps whatever URL comes back — see docs/ADMIN.md.
 */
export async function uploadMedia(file) {
  const record = await mediaStore.upload(file)
  return record
}

export async function listMedia() {
  const items = await mediaStore.list()
  return {
    items: items.map((m) => ({
      id: m.id,
      url: `media:${m.id}`,
      type: m.type,
      name: m.name,
      width: m.width,
      height: m.height,
      duration: m.duration ?? null,
      bytes: m.bytes,
      createdAt: m.createdAt,
    })),
    total: items.length,
  }
}

export async function deleteMedia(id) {
  return mediaStore.remove(id)
}

export async function listLibrary() {
  await latency()
  return db.getLibrary()
}

export async function saveLibraryItem({ kind, item }) {
  await latency()
  try {
    return db.saveLibraryItem(kind, item)
  } catch (err) {
    throw new ApiError(err.message, { status: 422, code: 'invalid_kind' })
  }
}

export async function deleteLibraryItem({ kind, id }) {
  await latency()
  try {
    return db.deleteLibraryItem(kind, id)
  } catch (err) {
    throw new ApiError(err.message, { status: 422, code: 'invalid_kind' })
  }
}

export async function adminSaveSizeChart(chart) {
  await latency()
  return db.upsertSizeChart(chart)
}

export async function adminGetProduct(idOrSlug) {
  await latency()
  const p = products.find((x) => x.id === idOrSlug || x.slug === idOrSlug)
  if (!p) throw new ApiError('Product not found.', { status: 404, code: 'not_found' })
  // Admin sees the raw record, including the chart reference rather than the
  // resolved copy — you edit the link, not the snapshot.
  const { _imageQuery, _altQuery, ...rest } = p
  return rest
}

export async function adminReset() {
  await latency()
  await db.resetToSeed()
  adopt()
  return { ok: true }
}

