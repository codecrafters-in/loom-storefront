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
import { adminFetch } from '../admin-session.js'
import { ApiError, ContractError, assertCart, assertList, assertMoney, assertProduct } from './contracts.js'
import { ACCESS_HEADER, accessRequired, accessToken } from '../access.js'
import { chosenPricelist } from '../pricelist.js'
import { currentLanguage, languageFromAddress } from '../../i18n/index.js'

const SESSION_KEY = 'loom.session'

/**
 * The signed-in customer's token, and nothing else.
 *
 * There used to be a build-time token that overrode this. It was sent in place
 * of the customer's own, so with it set every sign-in "worked" and then every
 * account call answered as somebody else — or as nobody.
 */
function customerToken() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.token || ''
  } catch {
    return ''
  }
}

/**
 * Filters whose values are names a merchant typed. A comma in one ("Red, dark")
 * would split it in two, so these repeat the parameter instead of joining it.
 */
const REPEATED = new Set(['attr', 'spec'])

function url(path, query) {
  const u = new URL(config.api.baseUrl + path, window.location.origin)
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    if (Array.isArray(v) && REPEATED.has(k)) v.forEach((item) => u.searchParams.append(k, String(item)))
    else if (Array.isArray(v)) u.searchParams.set(k, v.join(','))
    else u.searchParams.set(k, String(v))
  }
  return u.toString()
}

const isAdminPath = (path) => path === '/admin' || path.startsWith('/admin/')

/**
 * One request, returning the Response.
 *
 * No `credentials: 'include'`. Authentication is the Authorization header and
 * nothing else, so there is no cookie for the API to read — and a server that
 * answered credentialed requests would have to name this origin exactly and
 * could never fall back to `*`.
 */
async function send(method, path, { query, body, auth }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.api.timeout)
  // A store in maintenance or behind a password answers only calls that carry its access token.
  const access = accessToken()
  const pricelist = chosenPricelist()
  // A language in the page address is asked for; without one the backend answers in the store's default.
  const language = languageFromAddress() ? currentLanguage() : ''
  try {
    return await fetch(url(path, query), {
      method,
      signal: controller.signal,
      // The server's Cache-Control is honoured unless the cache is switched off.
      cache: config.api.cache ? 'default' : 'no-store',
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
        ...(access ? { [ACCESS_HEADER]: access } : {}),
        // The currency the shopper picked; the server varies its cached answers on it.
        ...(pricelist ? { 'x-loom-pricelist': pricelist } : {}),
        ...(language ? { 'x-loom-lang': language } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError(`${method} ${path} timed out after ${config.api.timeout}ms.`, { code: 'timeout' })
    }
    // Almost always CORS or a wrong base URL — say so, because the browser will not.
    throw new ApiError(
      `Could not reach ${config.api.baseUrl}. Check VITE_API_BASE_URL and that the server sends CORS headers for this origin.`,
      { code: 'network_error', detail: err.message },
    )
  } finally {
    clearTimeout(timer)
  }
}

async function request(method, path, { query, body } = {}) {
  // The admin token for /admin calls, the customer token for everything else —
  // never the other way round. A shopper's session must not reach the write
  // API, and an admin session must not be sent to the shop's customer
  // endpoints. The admin one renews itself; see lib/admin-session.js.
  const res = isAdminPath(path)
    ? await adminFetch((auth) => send(method, path, { query, body, auth }))
    : await send(method, path, { query, body, auth: customerToken() })

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
    if (payload?.code === 'store_locked' || payload?.code === 'store_maintenance') accessRequired(payload.code)
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
    attr: query.attr,
    spec: query.spec,
    brand: query.brand,
    in_brand: query.inBrand,
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

/**
 * Price and stock for choices `variants[]` cannot answer: a dynamic option's
 * combination nobody has bought yet, or no-variant extras on top.
 */
export async function getCombination(slug, choiceIds = []) {
  const where = `POST /products/${slug}/combination`
  const res = await post(`/products/${encodeURIComponent(slug)}/combination`, { choiceIds })
  if (!res || typeof res.available !== 'boolean') throw new ContractError(where, '{ exists, variantId, available, price }', res)
  assertMoney(res.price, `${where} price`)
  return res
}

export const listBrands = () => get('/brands').then((r) => assertList(r, 'GET /brands'))

/* ── pages, contact, consent, access, blog ─────────────────────────────── */

export const listPages = () => get('/pages').then((r) => assertList(r, 'GET /pages'))

export async function getPage(slug) {
  const page = await get(`/pages/${encodeURIComponent(slug)}`)
  if (!page || typeof page.title !== 'string' || !Array.isArray(page.blocks)) {
    throw new ContractError(`GET /pages/${slug}`, '{ slug, title, intro, blocks[] }', page)
  }
  return page
}

/** `{ name, email, phone, order, subject, message, captchaToken }` → `{ ok }`. */
export const sendContact = (message) => post('/contact', message)

/** `{ anonymousId, choices: { analytics, marketing }, policyVersion }`, kept by the backend as proof of consent. */
export const recordConsent = (consent) => post('/consents', consent)

/** A password-protected store's password → `{ token, header, expiresAt }`. */
export const requestAccess = (password) => post('/access', { password })

/** The same token for a signed-in admin, while the store is closed to shoppers. */
export const adminAccess = () => post('/admin/access', {})

export const listBlogPosts = ({ page, perPage, tag, blog } = {}) =>
  get('/blog', { page, per_page: perPage, tag, blog }).then((r) => assertList(r, 'GET /blog'))

export const getBlogPost = (slug) => get(`/blog/${encodeURIComponent(slug)}`)

/**
 * A file bought with an order, as a Blob, or null when `href` is not an API route
 * (the browser can follow it as a plain link).
 *
 * `GET /orders/:id/downloads/:doc` answers to the order's owner or to whoever holds
 * the guest order link, which expires after 30 days. A plain link sends no token,
 * so a signed-in customer's older order would answer 404; fetching it with the
 * customer's token keeps every one of their downloads working.
 */
export async function downloadFile(href) {
  const base = config.api.baseUrl
  if (!href || !href.startsWith(base)) return null
  const path = href.slice(base.length)
  const res = await send('GET', path, { auth: customerToken() })
  if (!res.ok) {
    throw new ApiError(`GET ${path} failed with ${res.status}.`, { status: res.status, code: `http_${res.status}` })
  }
  return res.blob()
}
export const getBrand = (slug) => get(`/brands/${encodeURIComponent(slug)}`)

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
const FRESH_CART_KEY = 'loom.cart_fresh'

/**
 * The bag became an order: forget it, and ask for a fresh one next time. Without
 * `fresh`, a signed-in customer's older open bag came back as "your bag" with
 * items that looked already bought.
 */
function markCartSpent() {
  try {
    localStorage.removeItem(CART_KEY)
    localStorage.setItem(FRESH_CART_KEY, '1')
  } catch {
    /* storage unavailable — the next bag is a new one anyway */
  }
}
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
  let fresh = false
  try {
    fresh = localStorage.getItem(FRESH_CART_KEY) === '1'
  } catch {
    /* storage unavailable */
  }
  const cart = rememberCart(assertCart(await post('/carts', fresh ? { fresh: true } : {}), 'POST /carts'))
  if (fresh) {
    try {
      localStorage.removeItem(FRESH_CART_KEY)
    } catch {
      /* storage unavailable */
    }
  }
  return cart
}

export async function getCart() {
  return ensureCart()
}

const customBody = (values) => values.map((c) => ({ choice_id: c.choiceId, text: c.text }))

/**
 * `variant_id` when that is all there is, which every backend understands.
 * Otherwise the product and its choices: a dynamic combination has no variant id
 * yet, and extras, typed text, a combo's items and optional products all ride
 * on the same request so the server prices them together.
 */
export async function addToCart({
  variantId, productSlug, choiceIds, extraChoiceIds, customValues, comboItems, optionalProducts, quantity = 1,
}) {
  const cart = await ensureCart()
  const body = variantId
    ? { variant_id: variantId, quantity }
    : { product_slug: productSlug, choice_ids: choiceIds || [], quantity }
  if (extraChoiceIds?.length) body.extra_choice_ids = extraChoiceIds
  if (customValues?.length) body.custom_values = customBody(customValues)
  if (comboItems?.length) {
    body.combo_items = comboItems.map((item) => ({
      combo_item_id: item.comboItemId,
      ...(item.extraChoiceIds?.length ? { extra_choice_ids: item.extraChoiceIds } : {}),
      ...(item.customValues?.length ? { custom_values: customBody(item.customValues) } : {}),
    }))
  }
  if (optionalProducts?.length) {
    body.optional_products = optionalProducts.map((o) => ({ variant_id: o.variantId, quantity: o.quantity ?? 1 }))
  }
  return assertCart(await post(`/carts/${cart.id}/lines`, body), 'POST /carts/:id/lines')
}

export async function updateCartLine(lineId, quantity) {
  const cart = await ensureCart()
  if (quantity <= 0) return removeCartLine(lineId)
  return assertCart(
    await patch(`/carts/${cart.id}/lines/${lineId}`, { quantity }),
    'PATCH /carts/:id/lines/:lineId',
  )
}

/**
 * Save for later. Signed in, the line moves to the account's saved items in one request; a guest's product is
 * saved in this browser (see the wishlist below) and the line removed.
 */
export async function saveForLater(lineId, productSlug) {
  const cart = await ensureCart()
  if (customerToken()) {
    return assertCart(await post(`/carts/${cart.id}/lines/${lineId}/save`, {}), 'POST /carts/:id/lines/:lineId/save')
  }
  if (productSlug) await addToWishlist(productSlug)
  return removeCartLine(lineId)
}

export async function removeCartLine(lineId) {
  const cart = await ensureCart()
  return assertCart(await del(`/carts/${cart.id}/lines/${lineId}`), 'DELETE /carts/:id/lines/:lineId')
}

/** Price the bag with another of the store's pricelists (the currency switcher). */
export async function setCartPricelist(pricelistId) {
  const cart = await ensureCart()
  return assertCart(await post(`/carts/${cart.id}/pricelist`, { pricelist_id: pricelistId }), 'POST /carts/:id/pricelist')
}

export async function applyDiscount(code) {
  const cart = await ensureCart()
  return assertCart(await post(`/carts/${cart.id}/discount`, { code }), 'POST /carts/:id/discount')
}

/** Add a code, keeping the ones already on the bag. */
export async function addCode(code) {
  const cart = await ensureCart()
  return assertCart(await post(`/carts/${cart.id}/codes`, { code }), 'POST /carts/:id/codes')
}

export async function removeCode(code) {
  const cart = await ensureCart()
  return assertCart(await del(`/carts/${cart.id}/codes/${encodeURIComponent(code)}`), 'DELETE /carts/:id/codes/:code')
}

/** Claim one of the bag's `claimableRewards`: a free product to pick, or a reward the shopper's points pay for. */
export async function claimReward({ couponId, rewardId, variantId } = {}) {
  const cart = await ensureCart()
  return assertCart(
    await post(`/carts/${cart.id}/rewards`, { coupon_id: couponId, reward_id: rewardId, variant_id: variantId }),
    'POST /carts/:id/rewards',
  )
}

/** A gift card's balance, for "check a gift card". */
export const getGiftCard = (code) => get(`/gift-cards/${encodeURIComponent(code)}`)

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
  markCartSpent()
  return order
}

export const listOrders = () => get('/orders').then((r) => assertList(r, 'GET /orders'))
export const getOrder = (orderId) => get(`/orders/${encodeURIComponent(orderId)}`)

/* ── on-site payments (checkout.mode "payments") ───────────────────────── */

// Never cached: every answer here is about one shopper's money.

const checkoutFields = (body = {}) => ({
  email: body.email,
  shipping_address: body.shippingAddress,
  shipping_method: body.shippingMethod,
  currency: body.currency,
  // Optional: a billing address other than the delivery one, and a business's company name and tax ID.
  billing_address: body.billingAddress,
  company_name: body.companyName,
  vat: body.vat,
  // Optional, as far as the store's checkout settings allow: delivery instructions, gift message and wrapping, and
  // the terms checkbox when the store requires it.
  note: body.note,
  gift_message: body.giftMessage,
  gift_wrap: body.giftWrap,
  accept_terms: body.acceptTerms,
  // One of `getDeliverySlots`, when the delivery method offers slots.
  delivery_slot: body.deliverySlot,
})

function assertPayment(payment, where) {
  if (!payment || typeof payment.id !== 'string' || typeof payment.status !== 'string') {
    throw new ContractError(where, 'a Payment with string "id" and "status"', payment)
  }
  return payment
}

/** A payment with an order behind it has spent the cart; the next visit starts a new bag. */
function forgetSpentCart(payment) {
  if (payment?.order) markCartSpent()
  return payment
}

const paymentPath = (paymentId) => `/payments/${encodeURIComponent(paymentId)}`

export async function getPaymentOptions(cartIdArg, body = {}) {
  const id = cartIdArg || (await ensureCart()).id
  const options = await post(`/carts/${encodeURIComponent(id)}/payment-options`, checkoutFields(body))
  if (!options || !Array.isArray(options.methods)) {
    throw new ContractError('POST /carts/:id/payment-options', 'an object with a "methods" array', options)
  }
  return options
}

export async function createPayment(cartIdArg, body = {}) {
  const id = cartIdArg || (await ensureCart()).id
  const payment = await post(`/carts/${encodeURIComponent(id)}/payments`, {
    ...checkoutFields(body),
    provider_id: body.providerId,
    method_id: body.methodId,
    token_id: body.tokenId,
    save_method: Boolean(body.saveMethod),
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
    expected_total: body.expectedTotal,
  })
  return forgetSpentCart(assertPayment(payment, 'POST /carts/:id/payments'))
}

export async function paymentAction(paymentId, action, body = {}) {
  const payment = await post(`${paymentPath(paymentId)}/actions/${encodeURIComponent(action)}`, body)
  return forgetSpentCart(assertPayment(payment, 'POST /payments/:id/actions/:action'))
}

export async function getPayment(paymentId) {
  return forgetSpentCart(assertPayment(await get(paymentPath(paymentId)), 'GET /payments/:id'))
}

/* ── paying for a placed order ("Pay now"), and a gateway page left open ── */

/** Ways to pay what is left on an order: a quotation from the shop, or an order confirmed without payment. */
export async function getOrderPaymentOptions(orderId) {
  const options = await post(`/orders/${encodeURIComponent(orderId)}/payment-options`, {})
  if (!options || !Array.isArray(options.methods)) {
    throw new ContractError('POST /orders/:id/payment-options', 'an object with a "methods" array', options)
  }
  return options
}

export async function createOrderPayment(orderId, body = {}) {
  const payment = await post(`/orders/${encodeURIComponent(orderId)}/payments`, {
    provider_id: body.providerId,
    method_id: body.methodId,
    token_id: body.tokenId,
    save_method: Boolean(body.saveMethod),
    success_url: body.successUrl,
    cancel_url: body.cancelUrl,
  })
  // Not `forgetSpentCart`: this order was placed long ago, and the shopper's current bag is another one.
  return assertPayment(payment, 'POST /orders/:id/payments')
}

/** Wallet buttons for the bag (Apple Pay, Google Pay), before any address: `{ amount, shippingRequired, methods }`. */
export async function getExpressOptions(cartIdArg) {
  const id = cartIdArg || (await ensureCart()).id
  const options = await post(`/carts/${encodeURIComponent(id)}/express-options`, {})
  if (!options || !Array.isArray(options.methods)) {
    throw new ContractError('POST /carts/:id/express-options', 'an object with a "methods" array', options)
  }
  return options
}

/** Delivery methods priced for a (possibly partial) address, and the bag's total with `method` applied. */
/** `{ required, slots, selected }` for a delivery method (its code), when the store offers delivery slots. */
export async function getDeliverySlots(cartIdArg, method) {
  const id = cartIdArg || (await ensureCart()).id
  const result = await get(`/carts/${encodeURIComponent(id)}/slots`, { method })
  if (!result || !Array.isArray(result.slots)) {
    throw new ContractError('GET /carts/:id/slots', 'an object with a "slots" array', result)
  }
  return result
}

/** Shops an in-store method collects from, nearest first to `postalCode` + `country`, else to the bag's address. */
export async function getPickupLocations(cartIdArg, { method, postalCode, country } = {}) {
  const id = cartIdArg || (await ensureCart()).id
  const result = await get(`/carts/${encodeURIComponent(id)}/pickup-locations`, { method, zip: postalCode || undefined, country: postalCode ? country : undefined })
  if (!result || !Array.isArray(result.locations)) {
    throw new ContractError('GET /carts/:id/pickup-locations', 'an object with a "locations" array', result)
  }
  return result
}

/** Collect the bag from a shop: sets the in-store method and its shop, and answers the bag. */
export async function setPickupLocation(cartIdArg, { method, locationId }) {
  const id = cartIdArg || (await ensureCart()).id
  return assertCart(await post(`/carts/${encodeURIComponent(id)}/pickup-location`, { method, location_id: locationId }), 'POST /carts/:id/pickup-location')
}

export async function getShippingOptions(cartIdArg, { address, method } = {}) {
  const id = cartIdArg || (await ensureCart()).id
  const result = await post(`/carts/${encodeURIComponent(id)}/shipping-options`, { address, method })
  if (!result || !Array.isArray(result.options)) {
    throw new ContractError('POST /carts/:id/shipping-options', 'an object with an "options" array', result)
  }
  return result
}

/** Cancel a payment started on a gateway's own page, so the bag can change again. */
export async function cancelCartPayment() {
  const cart = await ensureCart()
  return assertCart(await post(`/carts/${cart.id}/cancel-payment`, {}), 'POST /carts/:id/cancel-payment')
}

/** The customer's loyalty points and store credit, with recent history. */
export const getLoyalty = () => get('/me/loyalty').then((r) => assertList(r, 'GET /me/loyalty'))

/** Cards and accounts the payment providers saved for the signed-in customer. */
export const listPaymentMethods = () =>
  get('/me/payment-methods').then((r) => assertList(r, 'GET /me/payment-methods'))
export const deletePaymentMethod = (id) =>
  del(`/me/payment-methods/${encodeURIComponent(id)}`).then((r) => assertList(r, 'DELETE /me/payment-methods/:id'))

/* ── account ───────────────────────────────────────────────────────────── */

function storeSession(res) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: res.token }))
  } catch {
    /* session will not survive a reload */
  }
  return res
}

/** What a guest saved joins the account on sign-in; kept for the next try if that fails. */
async function mergeGuestWishlist(res) {
  const slugs = guestSlugs()
  if (slugs.length) {
    try {
      await post('/me/wishlist/merge', { product_slugs: slugs.slice(0, 100) })
      setGuestSlugs([])
    } catch {
      /* still in this browser; the next sign-in tries again */
    }
  }
  return res
}

export const login = (body) => post('/auth/login', body).then(storeSession).then(mergeGuestWishlist)
export const register = (body) => post('/auth/register', body).then(storeSession).then(mergeGuestWishlist)
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

/**
 * Signed out is known without asking.
 *
 * The API authenticates with the bearer token stored at sign-in (docs/API.md),
 * so a browser holding none is a visitor by definition. Asking anyway costs a
 * request on every page load, and because browsers print every failed request,
 * it puts a red 401 in the console for every visitor — the normal state
 * reported as an error.
 */
const unauthenticated = () => new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })

function forgetSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* already gone */
  }
}

export async function getMe() {
  if (!customerToken()) throw unauthenticated()
  try {
    return await get('/me')
  } catch (err) {
    // An expired or revoked token: drop it, so the next load does not ask again.
    if (err.status === 401) forgetSession()
    throw err
  }
}
export const updateMe = (body) => patch('/me', body)
/** States and required address fields for one country — public, cacheable. */
export const getCountry = (code) => get(`/countries/${encodeURIComponent(code)}`)
export const saveAddress = (address) =>
  address.id ? patch(`/me/addresses/${address.id}`, address) : post('/me/addresses', address)
export const deleteAddress = (addressId) => del(`/me/addresses/${addressId}`)

/* ── wishlist ──────────────────────────────────────────────────────────── */

/*
 * A guest's saved items live in this browser, newest first, and join the account when they sign in
 * (`POST /me/wishlist/merge`). The key is the one other tabs watch, so a heart filled here fills there.
 */
const GUEST_WISHLIST_KEY = 'loom.wishlist'
function guestSlugs() {
  try {
    const slugs = JSON.parse(localStorage.getItem(GUEST_WISHLIST_KEY) || '[]')
    return Array.isArray(slugs) ? slugs.filter((slug) => typeof slug === 'string') : []
  } catch {
    return []
  }
}
function setGuestSlugs(slugs) {
  try {
    if (slugs.length) localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify(slugs))
    else localStorage.removeItem(GUEST_WISHLIST_KEY)
  } catch {
    /* storage unavailable — saved for this page only */
  }
  return slugs
}

export async function getWishlist() {
  if (customerToken()) return get('/me/wishlist').then((r) => assertList(r, 'GET /me/wishlist'))
  const slugs = guestSlugs()
  if (!slugs.length) return { items: [], total: 0 }
  const res = assertList(await get('/products', { slugs: slugs.join(','), per_page: 100 }), 'GET /products?slugs=')
  // In the order they were saved; a product no longer sold simply drops out.
  const bySlug = new Map(res.items.map((product) => [product.slug, product]))
  const items = slugs.map((slug) => bySlug.get(slug)).filter(Boolean)
  return { items, total: items.length }
}
export const addToWishlist = (slug) =>
  customerToken()
    ? post('/me/wishlist', { product_slug: slug })
    : Promise.resolve({ ok: true, slugs: setGuestSlugs([slug, ...guestSlugs().filter((s) => s !== slug)]) })
export const removeFromWishlist = (slug) =>
  customerToken()
    ? del(`/me/wishlist/${encodeURIComponent(slug)}`)
    : Promise.resolve({ ok: true, slugs: setGuestSlugs(guestSlugs().filter((s) => s !== slug)) })

/* ── misc ──────────────────────────────────────────────────────────────── */

/**
 * `captchaToken` only when the store asks for a captcha (`security.captcha` in
 * the settings document). Login, register and order lookup take it the same
 * way, inside the body the page passes in.
 */
export const subscribe = (email, { captchaToken } = {}) =>
  post('/newsletter', captchaToken ? { email, captchaToken } : { email })

/** Optional. If the endpoint 404s the caller falls back to the shipping copy. */
export const getDeliveryEstimate = ({ method = 'standard', country = 'US' } = {}) =>
  get('/delivery-estimate', { method, country })

/** Whether the store delivers to an address (a postcode is enough), with each method's arrival date. */
export const checkServiceability = ({ country, region, postalCode, variantId } = {}) =>
  get('/serviceability', { country, region, postal_code: postalCode, variant_id: variantId })

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
export const adminSaveProduct = (patch) =>
  patch.id ? patch_(`/admin/products/${patch.id}`, patch) : post('/admin/products', patch)
export const adminDeleteProduct = (id) => del(`/admin/products/${encodeURIComponent(id)}`)
export const adminSetInventory = (variantId, quantity) =>
  patch_(`/admin/variants/${encodeURIComponent(variantId)}/inventory`, { quantity })
export const adminAdjustInventory = (variantId, delta) =>
  post(`/admin/variants/${encodeURIComponent(variantId)}/inventory`, { delta })
export const adminSaveCategory = (body) => post('/admin/categories', body)
export const adminDeleteCategory = (slug) => del(`/admin/categories/${encodeURIComponent(slug)}`)
// Every category, including empty ones and ones holding only drafts — the
// public list leaves those out, and they are exactly what an admin needs to see.
export const adminListCategories = () =>
  get('/admin/categories').then((r) => assertList(r, 'GET /admin/categories'))
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
/**
 * Both fields, or nothing. And rate-limit this on the server: order numbers are
 * sequential in most shops, so an unthrottled lookup is a way to enumerate them
 * against a list of leaked emails.
 */
export const lookupOrder = (body) => post('/orders/lookup', body)

/**
 * Place an order for money that has already been taken, and read one back.
 *
 * The body keys are snake_case because that is what the reference payments
 * server sends and what a backend built from the docs will expect. `created` in
 * the response is what tells a webhook handler whether this was the first
 * delivery or a retry — without it, every retry sends another confirmation.
 */
export const adminPlaceOrder = ({ cartId, email, payment, idempotencyKey }) =>
  post('/admin/orders', { cart_id: cartId, email, payment, idempotency_key: idempotencyKey })
export const adminGetOrder = (id) => get(`/admin/orders/${encodeURIComponent(id)}`)
/** Every order the store has taken, for the back office — `{ items, total, page, perPage, counts }`. */
export const adminListOrders = ({ q, status, payment, delivery, page = 1, perPage = 25 } = {}) =>
  get('/admin/orders', { q, status, payment, delivery, page, per_page: perPage })
    .then((r) => assertList(r, 'GET /admin/orders'))

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
  // The admin session, never the customer's: uploading is a write. Renewed and
  // retried like every other /admin call — a FormData body can be sent twice.
  const res = await adminFetch((auth) =>
    fetch(url('/admin/media'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      body,
    }),
  )
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
