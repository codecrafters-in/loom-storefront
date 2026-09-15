/**
 * The one place the theme decides where its data comes from.
 *
 * Every component imports `api` from here and never learns which adapter is
 * behind it. Swapping the demo for a real store is one environment variable —
 * `VITE_DATA_SOURCE=api` plus `VITE_API_BASE_URL` — and no code changes.
 *
 * Both adapters export identical names, and the assertion below fails at boot
 * if that ever stops being true, which is the failure mode when someone adds an
 * endpoint to one and forgets the other.
 */
import { config, assertConfig, isMock } from '../config.js'
import * as mock from './mock.js'
import * as http from './http.js'
import { cached, dedupe, dropPersisted, invalidate, keyOf, peek as peekKey, TTL } from './cache.js'

assertConfig()

/**
 * `__LOOM_API__` is written in by vite.config.js, which is what lets the build
 * leave the unused adapter out. Outside a Vite build (the tests, a script) it
 * does not exist, and the runtime setting decides as it always did.
 */
// eslint-disable-next-line no-undef
const apiMode = typeof __LOOM_API__ === 'boolean' ? __LOOM_API__ : !isMock
const adapter = apiMode ? http : mock

const SURFACE = [
  'getStorefront', 'getBootstrap',
  'listProducts', 'getProduct', 'getRelated', 'listCategories', 'listCollections', 'getReviews', 'createReview', 'getQuestions', 'askQuestion', 'confirmNewsletter', 'unsubscribeNewsletter', 'createAlert', 'stopAlerts',
  'getCombination', 'listBrands', 'getBrand',
  'listPages', 'getPage', 'sendContact', 'recordConsent', 'requestAccess', 'adminAccess', 'listBlogPosts', 'getBlogPost',
  'getCart', 'addToCart', 'updateCartLine', 'removeCartLine', 'applyDiscount', 'clearCart',
  'checkout', 'listOrders', 'getOrder', 'lookupOrder', 'downloadFile',
  'getPaymentOptions', 'createPayment', 'paymentAction', 'getPayment',
  'getOrderPaymentOptions', 'createOrderPayment', 'cancelCartPayment', 'listPaymentMethods', 'deletePaymentMethod',
  'getExpressOptions', 'getShippingOptions', 'checkServiceability',
  'addCode', 'removeCode', 'claimReward', 'getGiftCard', 'getLoyalty', 'saveForLater',
  'getDeliverySlots', 'getPickupLocations', 'setPickupLocation', 'setCartPricelist', 'setCartAttribution',
  'suggestSearch', 'popularSearches', 'logSearch',
  'adminPlaceOrder', 'adminGetOrder', 'adminListOrders',
  'login', 'register', 'logout', 'forgotPassword', 'resetPassword', 'signupWithToken', 'verifyEmail', 'resendVerification', 'recoverCart',
  'changePassword', 'changeEmail', 'confirmEmailChange', 'exportData', 'deleteAccount', 'requestLoginCode', 'verifyLoginCode', 'startOAuth', 'finishOAuth',
  'getCompany', 'inviteMember', 'updateMember', 'removeMember', 'requestQuote', 'cancelOrder', 'sendOrderMessage', 'reorder',
  'getOrderReturns', 'createReturn', 'cancelReturn', 'listReturns', 'getMe', 'updateMe', 'saveAddress', 'deleteAddress', 'getCountry',
  'getWishlist', 'addToWishlist', 'removeFromWishlist',
  'subscribe', 'getDeliveryEstimate',
  'adminListProducts', 'adminSaveProduct', 'adminDeleteProduct',
  'adminSetInventory', 'adminAdjustInventory',
  'adminListCategories', 'adminSaveCategory', 'adminDeleteCategory',
  'listLibrary', 'saveLibraryItem', 'deleteLibraryItem',
  'adminRefundOrder', 'adminGetCredentials', 'adminSaveCredentials', 'adminSendTestNotification',
  'adminUpdateSettings', 'adminImport', 'adminExport', 'adminReset',
  'listSizeCharts', 'listAttributes', 'adminSaveSizeChart', 'adminGetProduct',
  'adminUpdateOrder', 'adminListDiscounts', 'adminSaveDiscount', 'adminDeleteDiscount',
  'uploadMedia', 'listMedia', 'deleteMedia',
  'adminGetSettings', 'adminListQueue', 'adminUpdateQueueItem', 'adminGetDashboard',
]

// A developer's check, left out of built bundles (test/adapters.test.mjs runs it for both adapters instead).
// eslint-disable-next-line no-undef
if (typeof __LOOM_DEV__ === 'boolean' ? __LOOM_DEV__ : true) {
  const missing = SURFACE.filter((name) => typeof adapter[name] !== 'function')
  if (missing.length) {
    throw new Error(
      `The "${config.dataSource}" adapter is missing: ${missing.join(', ')}. Both adapters must implement the whole surface — see docs/API.md.`,
    )
  }
}

/**
 * Which reads are cacheable, and for how long.
 *
 * Anything not listed is passed straight through. Cart, orders and account are
 * deliberately absent: they are per-user and change on every action, and a
 * cached bag is how a shopper ends up looking at someone else's.
 */
const CACHEABLE = {
  getBootstrap: TTL.bootstrap,
  getStorefront: TTL.storefront,
  listProducts: TTL.catalog,
  listCategories: TTL.catalog,
  listCollections: TTL.catalog,
  getProduct: TTL.product,
  getRelated: TTL.product,
  // A read sent as a POST: the same choices always price the same, so it caches
  // like the product it belongs to and is purged with it.
  getCombination: TTL.product,
  listBrands: TTL.catalog,
  getBrand: TTL.catalog,
  listPages: TTL.catalog,
  getPage: TTL.catalog,
  listBlogPosts: TTL.catalog,
  getBlogPost: TTL.catalog,
  getReviews: TTL.reviews,
  getDeliveryEstimate: TTL.catalog,
  listSizeCharts: TTL.catalog,
  getCountry: TTL.catalog,
  listAttributes: TTL.catalog,
  listLibrary: TTL.catalog,
  suggestSearch: TTL.catalog,
}

/** A write to any of these drops the read namespaces it could have invalidated. */
/**
 * Reads whose prices depend on who is signed in.
 *
 * A customer pricelist, a trade discount or a different tax position can
 * change every price the moment someone signs in or out, so the copies cached
 * for the previous visitor have to go rather than wait out their window.
 */
const PRICED = ['listProducts', 'getProduct', 'getRelated', 'getCombination', 'getBootstrap']

const PURGES = {
  login: PRICED, register: PRICED, logout: PRICED, resetPassword: PRICED, signupWithToken: PRICED,
  forgotPassword: [], verifyEmail: [], resendVerification: [], recoverCart: [],
  changePassword: [], changeEmail: [], confirmEmailChange: [], exportData: [], requestLoginCode: [],
  deleteAccount: PRICED, verifyLoginCode: PRICED, startOAuth: [], finishOAuth: PRICED,
  inviteMember: [], updateMember: [], removeMember: [], requestQuote: [], cancelOrder: ['listOrders', 'getOrder'], sendOrderMessage: ['getOrder'], reorder: [], createReview: ['getReviews'], askQuestion: [], confirmNewsletter: [], unsubscribeNewsletter: [], createAlert: [], stopAlerts: [],
  createReturn: ['getOrderReturns', 'listReturns', 'getOrder'], cancelReturn: ['getOrderReturns', 'listReturns', 'getOrder'],
  addToCart: [], updateCartLine: [], removeCartLine: [], applyDiscount: [], clearCart: [],
  checkout: ['listProducts', 'getProduct', 'getCombination', 'getBootstrap'],
  // Options apply the address and delivery to the cart, so they are a write — never joined or cached.
  getPaymentOptions: [],
  // A payment that lands places the order and sells the stock, exactly like checkout.
  createPayment: ['listProducts', 'getProduct', 'getCombination', 'getBootstrap'],
  paymentAction: ['listProducts', 'getProduct', 'getCombination', 'getBootstrap'],
  // A save can teach the library a new attribute, so the vocabulary is stale too.
  adminSaveProduct: ['listProducts', 'getProduct', 'getRelated', 'getCombination', 'listBrands', 'getBootstrap', 'adminListProducts', 'adminGetProduct', 'listAttributes', 'listLibrary'],
  saveLibraryItem: ['listAttributes', 'listLibrary'],
  deleteLibraryItem: ['listAttributes', 'listLibrary'],
  adminSaveSizeChart: ['listSizeCharts', 'getProduct', 'adminGetProduct'],
  // Shipping, delivering or recording a payment changes what the shopper and the
  // order list see; cancelling returns stock, so the catalogue is stale too.
  adminUpdateOrder: ['listOrders', 'getOrder', 'adminGetOrder', 'adminListOrders', 'listProducts', 'getProduct', 'getBootstrap', 'adminListProducts'],
  // Placing an order sells stock, so the catalogue is stale as well as the
  // order lists.
  adminPlaceOrder: ['listOrders', 'getOrder', 'adminGetOrder', 'adminListOrders', 'getCart', 'listProducts', 'getProduct', 'getBootstrap', 'adminListProducts'],
  // A refund can put stock back, so the catalogue is stale too.
  adminRefundOrder: ['listOrders', 'getOrder', 'adminGetOrder', 'adminListOrders', 'listProducts', 'getProduct', 'getBootstrap', 'adminListProducts'],
  adminSaveCredentials: ['adminGetCredentials'],
  // A successful lookup grants this browser access to that order.
  lookupOrder: ['getOrder'],
  adminSaveDiscount: ['adminListDiscounts'],
  uploadMedia: ['listMedia'],
  deleteMedia: ['listMedia'],
  adminDeleteDiscount: ['adminListDiscounts'],
  adminDeleteProduct: ['listProducts', 'getProduct', 'getRelated', 'getBootstrap', 'adminListProducts'],
  adminSetInventory: ['listProducts', 'getProduct', 'getBootstrap', 'adminListProducts'],
  adminAdjustInventory: ['listProducts', 'getProduct', 'getBootstrap', 'adminListProducts'],
  adminSaveCategory: ['listCategories', 'adminListCategories', 'listProducts', 'getBootstrap'],
  adminDeleteCategory: ['listCategories', 'adminListCategories', 'listProducts', 'getBootstrap'],
  adminUpdateSettings: ['getStorefront', 'getBootstrap', 'adminGetSettings'],
  // A published review or answer shows on the product page; a return's step shows on the customer's order.
  adminUpdateQueueItem: ['adminListQueue', 'getReviews', 'getQuestions', 'getOrderReturns', 'listReturns', 'getOrder'],
  adminImport: null,   // null = purge everything
  adminReset: null,
}

// "Off" is about a browser serving a response it fetched earlier. A server
// render always caches: it cannot await, so it reads what `prime` fetched, and
// without the cache every prerendered page comes out empty. (The prerenderer
// defines a stand-in `window`, so ask Vite which bundle this is instead.)
const cacheOn = config.api.cache || Boolean(import.meta.env?.SSR)

// With the cache off, entries a previous session persisted must not be peeked
// at either, or the first paint shows the data the switch was meant to avoid.
// The server's seed for this page stays — it is what the markup was built from,
// and dropping it makes hydration throw the server's work away.
if (!cacheOn) dropPersisted()

function wrap(name, fn) {
  const ttl = cacheOn ? CACHEABLE[name] : 0
  const purges = PURGES[name]

  return async (...args) => {
    if (ttl) return cached(keyOf(name, args), () => fn(...args), ttl)

    // Uncached reads still de-duplicate — two components asking for the same
    // cart at once should not produce two requests.
    const result = purges === undefined
      ? await dedupe(keyOf(name, args), () => fn(...args))
      : await fn(...args)

    if (purges === null) invalidate()
    else if (purges) purges.forEach((prefix) => invalidate(prefix))
    return result
  }
}

export const api = Object.fromEntries(SURFACE.map((name) => [name, wrap(name, adapter[name])]))

/**
 * The same calls, read from the cache without a request.
 *
 * `peek.getProduct(slug)` returns what a `getProduct(slug)` would have, if it
 * is already there, and `undefined` otherwise. Two things need it: a server
 * render, which cannot await; and a hydrating page, which must not paint a
 * skeleton over content the server already sent.
 *
 * Deliberately not a fallback for reads. It never fetches, so anything using it
 * must still ask properly — this only removes the wait, never the request.
 */
export const peek = Object.fromEntries(
  SURFACE.map((name) => [name, (...args) => peekKey(keyOf(name, args))]),
)

/** Escape hatch for a "refresh" button, and for tests. */
export { invalidate, clearAll, stats as cacheStats } from './cache.js'
export { ApiError, ContractError } from './contracts.js'
export { config, isMock }
export default api
