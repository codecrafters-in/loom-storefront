import { config } from './config.js'

/**
 * One `track()`, pushing to `window.dataLayer`.
 *
 * No vendor script ships with the theme, and that is the point. A store already
 * has a tag manager, or a Plausible snippet, or a self-hosted Umami; a theme
 * that bundles its own is one more thing to rip out. `dataLayer` is the
 * lingua franca — GTM reads it natively, GA4 through GTM, and anything else can
 * be handed the same array.
 *
 * The event names follow GA4's ecommerce vocabulary (`view_item`,
 * `add_to_cart`, `purchase`) because a store's analytics people already have
 * reports built on them. Inventing `product_viewed` means every one of those
 * has to be rewritten.
 *
 * Three ways this stays quiet when it should:
 *
 *  - **No window, no tracking.** During a prerender there is no visitor.
 *  - **Off unless switched on.** `storefront.analytics.enabled` defaults to
 *    false, so a theme cloned for a demo does not start collecting.
 *  - **Do Not Track is honoured.** It is one line, it is what the header is
 *    for, and a shop that ignores it is telling on itself.
 */

let settings = { enabled: false, respectDoNotTrack: true, debug: false, consentRequired: false }
let consented = null

/** Called once from the storefront provider, when settings arrive. */
export function configureAnalytics(next = {}) {
  settings = { ...settings, ...next }
}

/**
 * Consent, if the store is gathering it.
 *
 * `null` means nobody has asked, which is treated as "allowed" — a shop with no
 * consent banner should not silently record nothing. A store that needs consent
 * calls `setConsent(false)` until it has it, and no event is sent before then.
 */
export function setConsent(value) {
  consented = value
}

function allowed() {
  if (typeof window === 'undefined') return false
  if (!settings.enabled) return false
  if (consented === false) return false
  // A store that asks for opt-in consent sends nothing until the visitor agrees.
  if (settings.consentRequired && consented !== true) return false
  if (settings.respectDoNotTrack !== false && doNotTrack()) return false
  return true
}

function doNotTrack() {
  try {
    return (
      window.doNotTrack === '1' ||
      navigator.doNotTrack === '1' ||
      navigator.doNotTrack === 'yes' ||
      navigator.msDoNotTrack === '1'
    )
  } catch {
    return false
  }
}

export function track(event, params = {}) {
  if (settings.debug && typeof console !== 'undefined') {
    console.debug('[analytics]', event, params)
  }
  if (!allowed()) return

  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, ...params })
  } catch {
    // Analytics must never be the reason a page fails. This is the one place
    // in the codebase where swallowing an error is the correct behaviour.
  }
}

/* ── the shapes, so call sites do not each invent one ──────────────────── */

/**
 * GA4 wants money in major units and a currency beside it. Everything else in
 * this codebase is minor units, so the conversion happens here rather than at
 * eight call sites that would each get it slightly wrong.
 */
const money = (m) => (m ? { value: m.amount / 100, currency: m.currency } : {})

export const itemOf = (product, extra = {}) => ({
  item_id: product?.slug,
  item_name: product?.title,
  price: product?.price ? product.price.amount / 100 : undefined,
  item_brand: config.store?.name,
  item_category: product?.categories?.[0],
  ...extra,
})

export const viewItem = (product) =>
  track('view_item', { ...money(product?.price), items: [itemOf(product)] })

export const viewItemList = (products, listName) =>
  track('view_item_list', {
    item_list_name: listName,
    items: (products || []).slice(0, 20).map((p, index) => itemOf(p, { index })),
  })

export const selectItem = (product, listName) =>
  track('select_item', { item_list_name: listName, items: [itemOf(product)] })

/**
 * Both take a cart line rather than a product.
 *
 * The cart is the only place that knows what was actually added — the variant,
 * the resulting quantity and the line total. Passing a product and a variant id
 * separately means every call site reassembles that, and one of them gets the
 * quantity wrong.
 */
const lineItem = (line, quantity) => ({
  item_id: line?.productSlug,
  item_name: line?.title,
  quantity: quantity ?? line?.quantity,
  price: line?.price ? line.price.amount / 100 : undefined,
  item_brand: config.store?.name,
  item_variant: line?.options ? Object.values(line.options).join(' / ') : undefined,
})

export const addToCart = (line, quantity) =>
  track('add_to_cart', { ...money(line?.price), items: [lineItem(line, quantity)] })

export const removeFromCart = (line) =>
  track('remove_from_cart', { ...money(line?.lineTotal), items: [lineItem(line)] })

export const beginCheckout = (cart) =>
  track('begin_checkout', {
    ...money(cart?.total),
    items: (cart?.lines || []).map((l) => ({
      item_id: l.productSlug,
      item_name: l.title,
      quantity: l.quantity,
    })),
  })

export const purchase = (order) =>
  track('purchase', {
    transaction_id: order?.number || order?.id,
    ...money(order?.total),
    shipping: order?.shipping ? order.shipping.amount / 100 : 0,
    tax: order?.tax ? order.tax.amount / 100 : 0,
    items: (order?.lines || []).map((l) => ({
      item_id: l.productSlug,
      item_name: l.title,
      quantity: l.quantity,
      price: l.price ? l.price.amount / 100 : undefined,
    })),
  })

export const addToWishlist = (product) =>
  track('add_to_wishlist', { ...money(product?.price), items: [itemOf(product)] })

export const search = (term, results) => track('search', { search_term: term, results })
