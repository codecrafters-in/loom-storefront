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

assertConfig()

const adapter = isMock ? mock : http

const SURFACE = [
  'getStorefront',
  'listProducts', 'getProduct', 'getRelated', 'listCategories', 'listCollections', 'getReviews',
  'getCart', 'addToCart', 'updateCartLine', 'removeCartLine', 'applyDiscount', 'clearCart',
  'checkout', 'listOrders', 'getOrder',
  'login', 'register', 'logout', 'getMe', 'updateMe', 'saveAddress', 'deleteAddress',
  'getWishlist', 'addToWishlist', 'removeFromWishlist',
  'subscribe', 'getDeliveryEstimate',
]

const missing = SURFACE.filter((name) => typeof adapter[name] !== 'function')
if (missing.length) {
  throw new Error(
    `The "${config.dataSource}" adapter is missing: ${missing.join(', ')}. Both adapters must implement the whole surface — see docs/API.md.`,
  )
}

export const api = Object.fromEntries(SURFACE.map((name) => [name, adapter[name]]))
export { ApiError, ContractError } from './contracts.js'
export { config, isMock }
export default api
