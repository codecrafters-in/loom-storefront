/**
 * Where a shopper came from: the campaign tags and ad click IDs of their first and last visit.
 *
 * Read from the address they land on (`utm_source`, `gclid`, `fbclid`…) and the referring site, kept in this browser,
 * and sent with the bag (`POST /carts/:id/attribution`). Odoo files the last visit on the order's Campaign, Medium and
 * Source, and uses the analytics cookies to report the purchase itself (docs/API.md). A visit that brings no tag and
 * comes from no other site (a reload, a bookmark) changes nothing, so the campaign that brought the shopper is not
 * overwritten by their tenth page view.
 */
const FIRST = 'loom.attribution.first'
const LAST = 'loom.attribution.last'
const SENT = 'loom.attribution.sent'
const UTM = ['source', 'medium', 'campaign', 'term', 'content']
const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid', 'epik']

const read = (key, store = localStorage) => {
  try {
    return JSON.parse(store.getItem(key) || 'null')
  } catch {
    return null
  }
}
const write = (key, value, store = localStorage) => {
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing: the order simply has no campaign.
  }
}

/** Record this visit, when it came with tags or from another site. Returns the visit, or null. */
export function captureVisit(location = window.location, referrer = typeof document !== 'undefined' ? document.referrer : '', now = new Date()) {
  const params = new URLSearchParams(location.search || '')
  const visit = {}
  for (const key of UTM) {
    const value = params.get(`utm_${key}`)
    if (value) visit[key] = value.slice(0, 100)
  }
  for (const key of CLICK_IDS) {
    const value = params.get(key)
    if (value) visit[key] = value.slice(0, 255)
  }
  let external = ''
  try {
    const from = referrer ? new URL(referrer) : null
    if (from && from.origin !== location.origin) external = from.href.slice(0, 512)
  } catch {
    // Not an address.
  }
  if (!Object.keys(visit).length && !external) return null
  Object.assign(visit, { landing: (location.pathname || '/').slice(0, 512), at: now.toISOString() }, external ? { referrer: external } : {})
  write(LAST, visit)
  if (!read(FIRST)) write(FIRST, visit)
  return visit
}

function cookies(source) {
  const out = {}
  for (const part of String(source || '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim())
  }
  return out
}

/**
 * What goes to the backend: both visits, the Google Analytics client ID (from `_ga`) and Meta's browser and click IDs
 * (`_fbp`, `_fbc`), and the visitor's consent when the store asks for it. Null when there is nothing to say.
 */
export function attribution(consent, cookieSource = typeof document !== 'undefined' ? document.cookie : '') {
  const jar = cookies(cookieSource)
  const ga = /^GA\d\.\d\.(\d+\.\d+)$/.exec(jar._ga || '')
  const payload = Object.fromEntries(
    Object.entries({
      first: read(FIRST),
      last: read(LAST),
      gaClientId: ga?.[1],
      fbp: jar._fbp,
      fbc: jar._fbc,
      consent,
    }).filter(([, value]) => value),
  )
  return payload.first || payload.last || payload.gaClientId || payload.fbp || payload.fbc ? payload : null
}

/** Whether exactly this was already sent for this bag (kept for the browser session). */
export function alreadySent(cartId, payload) {
  return read(SENT, sessionStorage) === `${cartId}:${JSON.stringify(payload)}`
}

export function markSent(cartId, payload) {
  write(SENT, `${cartId}:${JSON.stringify(payload)}`, sessionStorage)
}
