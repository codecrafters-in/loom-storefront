/**
 * The analytics and ad tags a merchant switched on in Odoo (`storefront.analytics.providers`), fed the same events as
 * the dataLayer.
 *
 * Google Analytics 4 and Google Tag Manager count as analytics; Meta Pixel, TikTok Pixel and Pinterest Tag as
 * marketing. A tag's script is added on the first event its consent allows, so a visitor who never consents downloads
 * none of them, and this module itself is only loaded by a store that has a tag (src/lib/analytics.js).
 *
 * Purchases carry the order reference as their event ID. Odoo reports the same purchase from the server when the store
 * has the keys (Measurement Protocol, Conversions API), and each platform counts it once.
 */
export const CATEGORY = { ga4: 'analytics', gtm: 'analytics', metaPixel: 'marketing', tiktok: 'marketing', pinterest: 'marketing' }

const META = {
  view_item: 'ViewContent', add_to_cart: 'AddToCart', add_to_wishlist: 'AddToWishlist', begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo', purchase: 'Purchase', search: 'Search',
}
const TIKTOK = {
  view_item: 'ViewContent', add_to_cart: 'AddToCart', add_to_wishlist: 'AddToWishlist', begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo', purchase: 'CompletePayment', search: 'Search',
}
const PINTEREST = { view_item: 'pagevisit', view_item_list: 'viewcategory', add_to_cart: 'addtocart', purchase: 'checkout', search: 'search' }

const clean = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''))

/**
 * One event in a tag's own words: the arguments for `gtag`, `fbq`, `ttq` or `pintrk`, or null when the tag has no such
 * event. Pure, for the tests.
 */
export function translate(name, event, params = {}) {
  const items = params.items || []
  const ids = items.map((item) => item.item_id).filter(Boolean)
  const quantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)

  if (name === 'ga4') return ['event', event, params]
  if (name === 'metaPixel') {
    if (event === 'page_view') return ['track', 'PageView']
    if (!META[event]) return null
    const data = clean({
      content_ids: ids.length ? ids : undefined,
      content_type: ids.length ? 'product' : undefined,
      contents: items.length ? items.map((item) => clean({ id: item.item_id, quantity: item.quantity || 1, item_price: item.price })) : undefined,
      num_items: event === 'purchase' || event === 'begin_checkout' ? quantity : undefined,
      value: params.value,
      currency: params.currency,
      search_string: params.search_term,
    })
    return event === 'purchase' ? ['track', META[event], data, { eventID: params.transaction_id }] : ['track', META[event], data]
  }
  if (name === 'tiktok') {
    if (event === 'page_view') return ['page']
    if (!TIKTOK[event]) return null
    const data = clean({
      contents: items.length ? items.map((item) => clean({ content_id: item.item_id, content_name: item.item_name, quantity: item.quantity || 1, price: item.price })) : undefined,
      content_type: ids.length ? 'product' : undefined,
      value: params.value,
      currency: params.currency,
      query: params.search_term,
    })
    return event === 'purchase' ? ['track', TIKTOK[event], data, { event_id: params.transaction_id }] : ['track', TIKTOK[event], data]
  }
  if (name === 'pinterest') {
    if (event === 'page_view') return ['page']
    if (!PINTEREST[event]) return null
    return [
      'track',
      PINTEREST[event],
      clean({
        value: params.value,
        currency: params.currency,
        order_id: params.transaction_id,
        event_id: params.transaction_id,
        order_quantity: event === 'purchase' ? quantity : undefined,
        search_query: params.search_term,
        line_items: items.length ? items.map((item) => clean({ product_id: item.item_id, product_name: item.item_name, product_price: item.price, product_quantity: item.quantity })) : undefined,
      }),
    ]
  }
  // Google Tag Manager reads the dataLayer itself.
  return null
}

function addScript(src) {
  const el = document.createElement('script')
  el.async = true
  el.src = src
  document.head.appendChild(el)
}

/* Each loader puts the vendor's queue in place first, so events sent before its script arrives are kept. */
const LOADERS = {
  ga4(id) {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    // Page views come from the storefront on every route change.
    window.gtag('config', id, { send_page_view: false })
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`)
  },
  gtm(id) {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
    addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`)
  },
  metaPixel(id) {
    if (!window.fbq) {
      const fbq = function fbq() {
        if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments)
        else fbq.queue.push(arguments)
      }
      Object.assign(fbq, { push: fbq, loaded: true, version: '2.0', queue: [] })
      window.fbq = fbq
      window._fbq = fbq
      addScript('https://connect.facebook.net/en_US/fbevents.js')
    }
    window.fbq('init', id)
  },
  tiktok(id) {
    if (!window.ttq) {
      const ttq = []
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']
      for (const method of ttq.methods) ttq[method] = (...args) => ttq.push([method, ...args])
      ttq._i = { [id]: Object.assign([], { _u: 'https://analytics.tiktok.com/i18n/pixel/events.js' }) }
      ttq._t = { [id]: Date.now() }
      ttq._o = { [id]: {} }
      window.TiktokAnalyticsObject = 'ttq'
      window.ttq = ttq
      addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`)
    }
  },
  pinterest(id) {
    if (!window.pintrk) {
      const pintrk = function pintrk(...args) { pintrk.queue.push(args) }
      Object.assign(pintrk, { queue: [], version: '3.0' })
      window.pintrk = pintrk
      addScript('https://s.pinimg.com/ct/core.js')
    }
    window.pintrk('load', id)
  },
}

const loaded = new Set()

/** Send one event to every tag the store has and the visitor's consent allows, loading the tag first if needed. */
export function send(event, params, providers = {}, permitted = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  for (const [name, id] of Object.entries(providers)) {
    if (!id || !LOADERS[name] || !permitted[CATEGORY[name]]) continue
    try {
      if (!loaded.has(name)) {
        loaded.add(name)
        LOADERS[name](id)
      }
      const call = translate(name, event, params)
      if (!call) continue
      if (name === 'ga4') window.gtag(...call)
      else if (name === 'metaPixel') window.fbq(...call)
      else if (name === 'tiktok') window.ttq[call[0]](...call.slice(1))
      else if (name === 'pinterest') window.pintrk(...call)
    } catch {
      // A tag must never be the reason a page fails.
    }
  }
}
