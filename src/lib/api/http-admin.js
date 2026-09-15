/**
 * The real-backend adapter's back office, loaded with its first call (see `laterAdmin` in http.js): the catalogue
 * editor's writes, orders and phone orders, refunds, discounts, store settings, import and export, the test email,
 * and the returns, reviews and questions waiting for someone. Documented in docs/ADMIN.md.
 */
import { ApiError, assertList } from './contracts.js'
import { get, post, request, send } from './http.js'
import { adminFetch } from '../admin-session.js'

const patch = (path, body) => request('PATCH', path, { body })
const del = (path) => request('DELETE', path)

/* ── catalogue ─────────────────────────────────────────────────────────── */

/** The most products one admin page may return. */
const ADMIN_PAGE_LIMIT = 100

/**
 * Admin product list.
 *
 * The API caps a page at 100, so a screen that wants everything at once (the
 * inventory table, the related-products picker) asks for more and gets it one
 * page at a time, up to what it asked for, instead of silently seeing the
 * first hundred.
 */
export async function adminListProducts({ q = '', page = 1, perPage = 25 } = {}) {
  if (perPage <= ADMIN_PAGE_LIMIT) return get('/admin/products', { q, page, per_page: perPage })
  const offset = (page - 1) * perPage
  const items = []
  let next = Math.floor(offset / ADMIN_PAGE_LIMIT) + 1
  let total = 0
  do {
    const chunk = await get('/admin/products', { q, page: next, per_page: ADMIN_PAGE_LIMIT })
    total = chunk.total
    items.push(...chunk.items)
    next += 1
    if (!chunk.items.length) break
  } while (items.length < offset % ADMIN_PAGE_LIMIT + perPage && (next - 1) * ADMIN_PAGE_LIMIT < total)
  const start = offset % ADMIN_PAGE_LIMIT
  return { items: items.slice(start, start + perPage), total, page, perPage }
}
export const adminGetProduct = (id) => get(`/admin/products/${encodeURIComponent(id)}`)
export const adminSaveProduct = (body) =>
  body.id ? patch(`/admin/products/${body.id}`, body) : post('/admin/products', body)
export const adminDeleteProduct = (id) => del(`/admin/products/${encodeURIComponent(id)}`)
export const adminSetInventory = (variantId, quantity) =>
  patch(`/admin/variants/${encodeURIComponent(variantId)}/inventory`, { quantity })
export const adminAdjustInventory = (variantId, delta) =>
  post(`/admin/variants/${encodeURIComponent(variantId)}/inventory`, { delta })
export const adminSaveCategory = (body) => post('/admin/categories', body)
export const adminDeleteCategory = (slug) => del(`/admin/categories/${encodeURIComponent(slug)}`)
// Every category, including empty ones and ones holding only drafts — the
// public list leaves those out, and they are exactly what an admin needs to see.
export const adminListCategories = () =>
  get('/admin/categories').then((r) => assertList(r, 'GET /admin/categories'))
export const adminSaveSizeChart = (chart) => post('/admin/size-charts', chart)

/**
 * The reuse library — the store's own attributes, feature cards and service
 * rows, kept so the sixtieth product does not start from a blank vocabulary.
 * `GET /attributes` already folds the attribute half into its response; these
 * are for managing it.
 */
export const listLibrary = () => get('/admin/library')
export const saveLibraryItem = ({ kind, item }) => post(`/admin/library/${encodeURIComponent(kind)}`, item)
export const deleteLibraryItem = ({ kind, id }) =>
  del(`/admin/library/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`)

/* ── bulk ──────────────────────────────────────────────────────────────── */

/** `{mode: 'merge', products, categories}` or `{csv}`, with `dry_run: true` to check a file without saving it. */
export const adminImport = (body) => post('/admin/import', body)

/**
 * The catalogue: JSON a page at a time (`{products, categories, total, page, perPage}`), or with
 * `format: 'csv'` the text of a spreadsheet with one row per variant.
 */
export async function adminExport({ format = 'json', page = 1, perPage = 100 } = {}) {
  if (format !== 'csv') return get('/admin/export', { page, per_page: perPage })
  const res = await adminFetch((auth) => send('GET', '/admin/export', { query: { format: 'csv' }, auth }))
  const text = await res.text()
  if (!res.ok) {
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch {
      // Not JSON: the status says enough.
    }
    throw new ApiError(payload?.message || `GET /admin/export failed with ${res.status}.`, {
      status: res.status,
      code: payload?.code || `http_${res.status}`,
      detail: payload,
    })
  }
  return text
}

/* ── orders ────────────────────────────────────────────────────────────── */

/**
 * Place an order: for money a payment provider already took (`cartId`, as a webhook does), or taken by phone
 * (`lines`, `shippingAddress`, `shippingMethod`, `payment: link | record | quote`).
 *
 * The body keys are snake_case because that is what the reference payments
 * server sends and what a backend built from the docs will expect. `created` in
 * the response is what tells a webhook handler whether this was the first
 * delivery or a retry — without it, every retry sends another confirmation.
 */
export const adminPlaceOrder = ({ cartId, lines, email, shippingAddress, billingAddress, shippingMethod, payment, notify, idempotencyKey } = {}) =>
  post('/admin/orders', {
    cart_id: cartId,
    lines,
    email,
    shipping_address: shippingAddress,
    billing_address: billingAddress,
    shipping_method: shippingMethod,
    payment,
    notify,
    idempotency_key: idempotencyKey,
  })
export const adminGetOrder = (id) => get(`/admin/orders/${encodeURIComponent(id)}`)
/** Every order the store has taken, for the back office — `{ items, total, page, perPage, counts }`. */
export const adminListOrders = ({ q, status, payment, delivery, page = 1, perPage = 25 } = {}) =>
  get('/admin/orders', { q, status, payment, delivery, page, per_page: perPage })
    .then((r) => assertList(r, 'GET /admin/orders'))
export const adminUpdateOrder = (id, body) => patch(`/admin/orders/${encodeURIComponent(id)}`, body)
export const adminRefundOrder = (orderId, body) =>
  post(`/admin/orders/${encodeURIComponent(orderId)}/refunds`, body)

/* ── discounts, settings, email ────────────────────────────────────────── */

export const adminListDiscounts = () => get('/admin/discounts').then((r) => assertList(r, 'GET /admin/discounts'))
/** Creates, or with an `id` (or a code that exists) changes, a discount. */
export const adminSaveDiscount = (body) => post('/admin/discounts', body)
/** Archived rather than deleted on a real backend: orders that used the code keep pointing at it. */
export const adminDeleteDiscount = (code) => del(`/admin/discounts/${encodeURIComponent(code)}`)

/** The storefront document plus `admin: { editable, canEdit, backendUrl }`: which settings may be changed here. */
export const adminGetSettings = () => get('/admin/storefront')
/** Only the settings that changed, as a partial document; one the backend does not change here is refused by name. */
export const adminUpdateSettings = (body) => patch('/admin/storefront', body)
export const adminSendTestNotification = (body) => post('/admin/notifications/test', body)

/**
 * Money and mail.
 *
 * `adminSaveCredentials` is the only write in this file whose response
 * deliberately carries less than it was given: a secret that can be read back
 * is a secret in every log, cache and browser history between here and the
 * server. The read returns whether each one is set and when. A backend that
 * keeps its keys itself (Odoo does) answers `404 use_odoo_backend` with links.
 */
export const adminGetCredentials = () => get('/admin/credentials')
export const adminSaveCredentials = (body) => post('/admin/credentials', body)
export const adminReset = () => post('/admin/reset', {})

/* ── returns, reviews and questions ────────────────────────────────────── */

const QUEUES = ['returns', 'reviews', 'questions']

function queuePath(kind) {
  if (!QUEUES.includes(kind)) throw new ApiError(`Unknown admin list "${kind}".`, { status: 400, code: 'invalid_queue' })
  return `/admin/${kind}`
}

/** `{ items, total, page, perPage, counts }` for `returns`, `reviews` or `questions`, filtered by `status`. */
export const adminListQueue = (kind, { status, q, page = 1, perPage = 25 } = {}) =>
  get(queuePath(kind), { status, q, page, per_page: perPage }).then((r) => assertList(r, `GET ${queuePath(kind)}`))
/** One action (`{ action, reason | reply | answer }`): the return, review or question as it now stands. */
export const adminUpdateQueueItem = (kind, id, body) => patch(`${queuePath(kind)}/${encodeURIComponent(id)}`, body)

/* ── dashboard ─────────────────────────────────────────────────────────── */

/** The store's last `days`: orders, revenue, average order, visits, conversion and abandoned carts (docs/ADMIN.md). */
export const adminGetDashboard = ({ days = 30 } = {}) => get('/admin/dashboard', { days })
