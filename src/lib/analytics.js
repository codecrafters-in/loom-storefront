import { config, isMock } from './config.js'
import { toMajor } from './money.js'

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

let settings = { enabled: false, respectDoNotTrack: true, debug: false, consentRequired: false, consentEnabled: false, providers: {} }
let consented = null
// Marketing consent (Meta, TikTok, Pinterest), separate from analytics consent.
let consentedMarketing = null
let tags = null
// Events sent before the store's settings arrived: the first page view and the product a visitor landed on happen
// before the settings request answers, and dropping them lost every tag's first page.
let configured = false
const pending = []

/** Called from the storefront provider once the store's settings are known. */
export function configureAnalytics(next = {}) {
  settings = { ...settings, ...next }
  configured = true
  for (const [event, params] of pending.splice(0)) track(event, params)
}

/**
 * Consent, if the store is gathering it.
 *
 * `null` means nobody has asked, which is treated as "allowed" — a shop with no
 * consent banner should not silently record nothing. A store that needs consent
 * calls `setConsent(false)` until it has it, and no event is sent before then.
 */
export function setConsent(value, marketing = value) {
  consented = value
  consentedMarketing = marketing
}

function allowed(category = 'analytics') {
  if (typeof window === 'undefined') return false
  if (!settings.enabled) return false
  const choice = category === 'marketing' ? consentedMarketing : consented
  if (choice === false) return false
  // A store that asks for opt-in consent sends nothing until the visitor agrees.
  if (settings.consentRequired && choice !== true) return false
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

/**
 * Day totals for the store's dashboard in Odoo (`POST /events`): a visit per browser session, product views, adds to
 * the bag and checkouts started. Nothing identifies the visitor — no cookie, no id, not even the page — so it needs no
 * consent; Do Not Track and `analytics.countVisits: false` still switch it off.
 */
const COUNTED = { page_view: 'visit', view_item: 'product_view', add_to_cart: 'add_to_cart', begin_checkout: 'checkout' }

function count(event) {
  const name = COUNTED[event]
  if (!name || isMock || settings.countVisits === false || typeof navigator === 'undefined' || !navigator.sendBeacon || doNotTrack()) return
  try {
    if (name === 'visit') {
      if (sessionStorage.getItem('loom.visit')) return
      sessionStorage.setItem('loom.visit', '1')
    }
    navigator.sendBeacon(`${config.api.baseUrl}/events`, new Blob([JSON.stringify({ events: [name] })], { type: 'text/plain' }))
  } catch {
    // Counting must never be the reason a page fails.
  }
}

export function track(event, params = {}) {
  if (!configured) {
    if (pending.length < 50) pending.push([event, params])
    return
  }
  count(event)
  if (settings.debug && typeof console !== 'undefined') {
    console.debug('[analytics]', event, params)
  }
  if (allowed('analytics')) {
    try {
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({ event, ...params })
    } catch {
      // Analytics must never be the reason a page fails. This is the one place
      // in the codebase where swallowing an error is the correct behaviour.
    }
  }
  toTags(event, params)
}

/**
 * The tags the merchant set in Odoo (GA4, Tag Manager, Meta, TikTok, Pinterest), each within its consent category.
 * Their code is a separate chunk, fetched only by a store that has one and a visitor who allows it.
 */
function toTags(event, params) {
  const providers = settings.providers || {}
  if (!Object.keys(providers).length) return
  const permitted = { analytics: allowed('analytics'), marketing: allowed('marketing') }
  if (!permitted.analytics && !permitted.marketing) return
  ;(tags ||= import('./tags.js'))
    .then((module) => module.send(event, params, providers, permitted))
    .catch(() => {
      tags = null
    })
}

/**
 * The visitor's consent as the backend wants it with the bag (`{analytics, marketing}`), or undefined when the store
 * shows no cookie banner. Odoo reports a purchase to Google or Meta only with the matching consent.
 */
export function consentState() {
  if (!settings.consentEnabled) return undefined
  return { analytics: allowed('analytics'), marketing: allowed('marketing') }
}

/** A route change in the single-page app. */
export const pageView = (path) =>
  track('page_view', {
    page_path: path,
    page_location: typeof window !== 'undefined' ? window.location?.href : undefined,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
  })

/* ── the shapes, so call sites do not each invent one ──────────────────── */

/**
 * GA4 wants money in major units and a currency beside it. Everything else in
 * this codebase is minor units, so the conversion happens here rather than at
 * eight call sites that would each get it slightly wrong — by the currency's own
 * decimals, not a hundred (a dinar is a thousand fils).
 */
const money = (m) => (m ? { value: toMajor(m), currency: m.currency } : {})

export const itemOf = (product, extra = {}) => ({
  item_id: product?.slug,
  item_name: product?.title,
  price: product?.price ? toMajor(product.price) : undefined,
  item_brand: product?.brand?.name || config.store?.name,
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
  price: line?.price ? toMajor(line.price) : undefined,
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
    shipping: order?.shipping ? toMajor(order.shipping) : 0,
    tax: order?.tax ? toMajor(order.tax) : 0,
    items: (order?.lines || []).map((l) => ({
      item_id: l.productSlug,
      item_name: l.title,
      quantity: l.quantity,
      price: l.price ? toMajor(l.price) : undefined,
    })),
  })

export const addToWishlist = (product) =>
  track('add_to_wishlist', { ...money(product?.price), items: [itemOf(product)] })

export const search = (term, results) => track('search', { search_term: term, results })

export const viewCart = (cart) =>
  track('view_cart', { ...money(cart?.total), items: (cart?.lines || []).map((l) => lineItem(l)) })

/** The delivery method was chosen at checkout. */
export const addShippingInfo = (cart, method) =>
  track('add_shipping_info', { ...money(cart?.total), shipping_tier: method, items: (cart?.lines || []).map((l) => lineItem(l)) })

/** The shopper started paying (`type`: the payment method's name). */
export const addPaymentInfo = (cart, type) =>
  track('add_payment_info', { ...money(cart?.total), payment_type: type, items: (cart?.lines || []).map((l) => lineItem(l)) })

/** One Core Web Vital of this page load (src/lib/vitals.js). */
export const webVital = (metric) =>
  track('web_vitals', {
    metric_name: metric.name,
    metric_value: metric.value,
    metric_rating: metric.rating,
    page_path: typeof window !== 'undefined' ? window.location?.pathname : undefined,
  })
