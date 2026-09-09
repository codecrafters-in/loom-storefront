/**
 * The real-backend adapter.
 *
 * Same function signatures as mock.js, so nothing above this file knows which
 * one is in play. Every endpoint it calls is written out in docs/API.md — if
 * your server answers those routes with those shapes, the theme works.
 *
 * Responses are validated at the boundary. A 200 with a wrong shape is the
 * hardest integration bug to chase, because it surfaces three components later
 * as a null dereference; checking here turns it into one clear error naming the
 * endpoint and the field.
 */
import { config } from '../config.js'
import { ApiError, ContractError, assertCart, assertList, assertProduct } from './contracts.js'

const SESSION_KEY = 'loom.session'

function token() {
  if (config.api.token) return config.api.token
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.token || ''
  } catch {
    return ''
  }
}

function url(path, query) {
  const u = new URL(config.api.baseUrl + path, window.location.origin)
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    if (Array.isArray(v)) u.searchParams.set(k, v.join(','))
    else u.searchParams.set(k, String(v))
  }
  return u.toString()
}

async function request(method, path, { query, body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.api.timeout)
  const auth = token()

  let res
  try {
    res = await fetch(url(path, query), {
      method,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new ApiError(`${method} ${path} timed out after ${config.api.timeout}ms.`, { code: 'timeout' })
    }
    // Almost always CORS or a wrong base URL — say so, because the browser will not.
    throw new ApiError(
      `Could not reach ${config.api.baseUrl}. Check VITE_API_BASE_URL and that the server sends CORS headers for this origin.`,
      { code: 'network_error', detail: err.message },
    )
  }
  clearTimeout(timer)

  if (res.status === 204) return null

  let payload = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(`${method} ${path} returned ${res.status} with a body that is not JSON.`, {
        status: res.status,
        code: 'bad_response',
        detail: text.slice(0, 200),
      })
    }
  }

  if (!res.ok) {
    throw new ApiError(payload?.message || payload?.error || `${method} ${path} failed with ${res.status}.`, {
      status: res.status,
      code: payload?.code || `http_${res.status}`,
      detail: payload,
    })
  }
  return payload
}

const get = (path, query) => request('GET', path, { query })
const post = (path, body) => request('POST', path, { body })
const patch_ = (path, body) => request('PATCH', path, { body })
const patch = patch_
const del = (path) => request('DELETE', path)

/* ── catalogue ─────────────────────────────────────────────────────────── */

export async function listProducts(query = {}) {
  const res = await get('/products', {
    category: query.category,
    collection: query.collection,
    q: query.q,
    sizes: query.sizes,
    colors: query.colors,
    tags: query.tags,
    min_price: query.minPrice,
    max_price: query.maxPrice,
    in_stock: query.inStock || undefined,
    sort: query.sort,
    page: query.page,
    per_page: query.perPage,
  })
  assertList(res, 'GET /products')
  res.items.forEach((p, i) => assertProduct(p, `GET /products items[${i}]`))
  return res
}

export async function getProduct(slug) {
  return assertProduct(await get(`/products/${encodeURIComponent(slug)}`), `GET /products/${slug}`)
}

export async function getRelated(slug, { limit = 4, strategy = 'automatic' } = {}) {
  const res = await get(`/products/${encodeURIComponent(slug)}/related`, { limit, strategy })
  return assertList(res, `GET /products/${slug}/related`)
}

export async function listCategories({ tree = true } = {}) {
  return assertList(await get('/categories', { tree: tree ? 1 : 0 }), 'GET /categories')
}

/**
 * The theme configuration. A store that cannot answer this still works — the
 * caller falls back to the bundled defaults — so it is safe to add last when
 * wiring up a backend.
 */
export async function getStorefront() {
  return get('/storefront')
}

export async function listCollections() {
  return assertList(await get('/collections'), 'GET /collections')
}

export async function getReviews(slug, { page = 1, perPage = 5 } = {}) {
  const res = await get(`/products/${encodeURIComponent(slug)}/reviews`, { page, per_page: perPage })
  assertList(res, `GET /products/${slug}/reviews`)
  // `summary` drives the whole ratings panel. A backend that omits it should
  // fail here with a message naming the field, not three components later on a
  // null dereference.
  if (!res.summary || typeof res.summary.average !== 'number') {
    throw new ContractError(`GET /products/${slug}/reviews summary`, '{ average, count, breakdown }', res.summary)
  }
  return res
}

/* ── cart ──────────────────────────────────────────────────────────────── */

const CART_KEY = 'loom.cart_id'
const cartId = () => {
  try {
    return localStorage.getItem(CART_KEY) || ''
  } catch {
    return ''
  }
}
const rememberCart = (cart) => {
  try {
    localStorage.setItem(CART_KEY, cart.id)
  } catch {
    /* storage unavailable — the cart lives for this tab only */
  }
  return cart
}

async function ensureCart() {
  const existing = cartId()
  if (existing) {
    try {
      return assertCart(await get(`/carts/${existing}`), `GET /carts/${existing}`)
    } catch (err) {
      // An expired or purged cart is normal; anything else should surface.
      if (err.status !== 404) throw err
    }
  }
  return rememberCart(assertCart(await post('/carts', {}), 'POST /carts'))
}

export async function getCart() {
  return ensureCart()
}

export async function addToCart({ variantId, quantity = 1 }) {
  const cart = await ensureCart()
  return assertCart(
    await post(`/carts/${cart.id}/lines`, { variant_id: variantId, quantity }),
    'POST /carts/:id/lines',
  )
}

export async function updateCartLine(lineId, quantity) {
  const cart = await ensureCart()
  if (quantity <= 0) return removeCartLine(lineId)
  return assertCart(
    await patch(`/carts/${cart.id}/lines/${lineId}`, { quantity }),
    'PATCH /carts/:id/lines/:lineId',
  )
}

export async function removeCartLine(lineId) {
  const cart = await ensureCart()
  return assertCart(await del(`/carts/${cart.id}/lines/${lineId}`), 'DELETE /carts/:id/lines/:lineId')
}

export async function applyDiscount(code) {
  const cart = await ensureCart()
  return assertCart(await post(`/carts/${cart.id}/discount`, { code }), 'POST /carts/:id/discount')
}

export async function clearCart() {
  const cart = await ensureCart()
  return assertCart(await del(`/carts/${cart.id}/lines`), 'DELETE /carts/:id/lines')
}

/* ── checkout and orders ───────────────────────────────────────────────── */

export async function checkout({ email, shippingAddress, shippingMethod = 'standard' }) {
  const cart = await ensureCart()
  const order = await post(`/carts/${cart.id}/checkout`, {
    email,
    shipping_address: shippingAddress,
    shipping_method: shippingMethod,
  })
  try {
    localStorage.removeItem(CART_KEY)
  } catch {
    /* nothing to forget */
  }
  return order
}

export const listOrders = () => get('/orders').then((r) => assertList(r, 'GET /orders'))
export const getOrder = (orderId) => get(`/orders/${encodeURIComponent(orderId)}`)

/* ── account ───────────────────────────────────────────────────────────── */

function storeSession(res) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: res.token }))
  } catch {
    /* session will not survive a reload */
  }
  return res
}

export const login = (body) => post('/auth/login', body).then(storeSession)
export const register = (body) => post('/auth/register', body).then(storeSession)
export async function logout() {
  try {
    await post('/auth/logout', {})
  } finally {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* already gone */
    }
  }
  return { ok: true }
}

export const getMe = () => get('/me')
export const updateMe = (body) => patch('/me', body)
export const saveAddress = (address) =>
  address.id ? patch(`/me/addresses/${address.id}`, address) : post('/me/addresses', address)
export const deleteAddress = (addressId) => del(`/me/addresses/${addressId}`)

/* ── wishlist ──────────────────────────────────────────────────────────── */

export const getWishlist = () => get('/me/wishlist').then((r) => assertList(r, 'GET /me/wishlist'))
export const addToWishlist = (slug) => post('/me/wishlist', { product_slug: slug })
export const removeFromWishlist = (slug) => del(`/me/wishlist/${encodeURIComponent(slug)}`)

/* ── misc ──────────────────────────────────────────────────────────────── */

export const subscribe = (email) => post('/newsletter', { email })

/** Optional. If the endpoint 404s the caller falls back to the shipping copy. */
export const getDeliveryEstimate = ({ method = 'standard', country = 'US' } = {}) =>
  get('/delivery-estimate', { method, country })

/**
 * Everything the first screen needs, in one round trip.
 *
 * Optional: if the endpoint is missing the caller falls back to four separate
 * requests, so this is a pure performance win you can add whenever. On a real
 * backend it is the difference between one query plan and five connections,
 * five auth checks and four waterfalls before the page is readable.
 */
export const getBootstrap = () => get('/bootstrap')

/* ── admin (write API) ─────────────────────────────────────────────────── */

export const adminListProducts = ({ q = '', page = 1, perPage = 25 } = {}) =>
  get('/admin/products', { q, page, per_page: perPage })
export const adminSaveProduct = (patch) =>
  patch.id ? patch_(`/admin/products/${patch.id}`, patch) : post('/admin/products', patch)
export const adminDeleteProduct = (id) => del(`/admin/products/${encodeURIComponent(id)}`)
export const adminSetInventory = (variantId, quantity) =>
  patch_(`/admin/variants/${encodeURIComponent(variantId)}/inventory`, { quantity })
export const adminAdjustInventory = (variantId, delta) =>
  post(`/admin/variants/${encodeURIComponent(variantId)}/inventory`, { delta })
export const adminSaveCategory = (body) => post('/admin/categories', body)
export const adminDeleteCategory = (slug) => del(`/admin/categories/${encodeURIComponent(slug)}`)
export const adminUpdateSettings = (body) => patch_('/admin/storefront', body)
export const adminImport = (body) => post('/admin/import', body)
export const adminExport = () => get('/admin/export')
export const listSizeCharts = () => get('/size-charts').then((r) => assertList(r, 'GET /size-charts'))
export const listAttributes = () => get('/attributes').then((r) => assertList(r, 'GET /attributes'))
export const adminSaveSizeChart = (chart) => post('/admin/size-charts', chart)

/**
 * The reuse library — the store's own attributes, feature cards and service
 * rows, kept so the sixtieth product does not start from a blank vocabulary.
 * `GET /attributes` already folds the attribute half into its response; these
 * are for managing it.
 */
/**
 * Money and mail.
 *
 * `adminSaveCredentials` is the only write in this file whose response
 * deliberately carries less than it was given: a secret that can be read back
 * is a secret in every log, cache and browser history between here and the
 * server. The read returns whether each one is set and when.
 */
export const adminRefundOrder = (orderId, body) =>
  post(`/admin/orders/${encodeURIComponent(orderId)}/refunds`, body)
export const adminGetCredentials = () => get('/admin/credentials')
export const adminSaveCredentials = (body) => post('/admin/credentials', body)
export const adminSendTestNotification = (body) => post('/admin/notifications/test', body)

export const listLibrary = () => get('/admin/library')
export const saveLibraryItem = ({ kind, item }) => post(`/admin/library/${encodeURIComponent(kind)}`, item)
export const deleteLibraryItem = ({ kind, id }) =>
  del(`/admin/library/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`)
export const adminGetProduct = (id) => get(`/admin/products/${encodeURIComponent(id)}`)

/**
 * Multipart, not JSON — a base64 body is a third larger and holds the whole
 * file in memory twice. Respond `{ id, url, type, width, height, duration }`.
 */
export async function uploadMedia(file) {
  const body = new FormData()
  body.append('file', file)
  let session = ''
  try {
    session = JSON.parse(localStorage.getItem('loom.session') || 'null')?.token || ''
  } catch {
    /* no session */
  }
  const res = await fetch(`${config.api.baseUrl}/admin/media`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(config.api.token || session ? { authorization: `Bearer ${config.api.token || session}` } : {}),
    },
    body,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(json?.message || `Upload failed with ${res.status}.`, {
      status: res.status,
      code: json?.code || 'upload_failed',
    })
  }
  return json
}

export const listMedia = () => get('/admin/media').then((r) => assertList(r, 'GET /admin/media'))
export const deleteMedia = (id) => del(`/admin/media/${encodeURIComponent(id)}`)
export const adminUpdateOrder = (id, body) => patch_(`/admin/orders/${encodeURIComponent(id)}`, body)
export const adminListDiscounts = () => get('/admin/discounts').then((r) => assertList(r, 'GET /admin/discounts'))
export const adminSaveDiscount = (body) => post('/admin/discounts', body)
export const adminDeleteDiscount = (code) => del(`/admin/discounts/${encodeURIComponent(code)}`)
export const adminReset = () => post('/admin/reset', {})
