import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import './helpers/browser.mjs'

const analytics = await import('../src/lib/analytics.js')

const layer = () => globalThis.window.dataLayer || []

/** Node 26 ships a real `navigator`, and it is a getter. */
const setNavigator = (value) =>
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })

beforeEach(() => {
  globalThis.window.dataLayer = []
  globalThis.window.doNotTrack = undefined
  setNavigator({ doNotTrack: undefined })
  analytics.setConsent(null)
  analytics.configureAnalytics({ enabled: true, respectDoNotTrack: true, debug: false })
})

test('nothing is sent until a store switches it on', () => {
  // A theme cloned for a demo must not start collecting on its own.
  analytics.configureAnalytics({ enabled: false })
  analytics.track('view_item', {})
  assert.equal(layer().length, 0)
})

test('an event lands on the dataLayer in GA4 shape', () => {
  analytics.viewItem({ slug: 'oxford-shirt-ecru', title: 'Everyday Oxford Shirt', price: { amount: 11800, currency: 'USD' } })
  const [event] = layer()
  assert.equal(event.event, 'view_item')
  // Major units, because that is what every ecommerce report expects. The rest
  // of the codebase is minor units, so this conversion happens in one place.
  assert.equal(event.value, 118)
  assert.equal(event.currency, 'USD')
  assert.equal(event.items[0].item_id, 'oxford-shirt-ecru')
  assert.equal(event.items[0].price, 118)
})

test('Do Not Track is honoured', () => {
  setNavigator({ doNotTrack: '1' })
  analytics.track('view_item', {})
  assert.equal(layer().length, 0)
})

test('a store can override Do Not Track, and has to say so', () => {
  setNavigator({ doNotTrack: '1' })
  analytics.configureAnalytics({ enabled: true, respectDoNotTrack: false })
  analytics.track('view_item', {})
  assert.equal(layer().length, 1)
})

test('refused consent silences everything', () => {
  analytics.setConsent(false)
  analytics.track('purchase', {})
  assert.equal(layer().length, 0)
  analytics.setConsent(true)
  analytics.track('purchase', {})
  assert.equal(layer().length, 1)
})

test('no consent asked is not the same as consent refused', () => {
  // A shop without a banner should not silently record nothing.
  analytics.setConsent(null)
  analytics.track('view_item', {})
  assert.equal(layer().length, 1)
})

test('cart events carry the variant, quantity and line total', () => {
  const line = {
    productSlug: 'oxford-shirt-ecru',
    title: 'Everyday Oxford Shirt',
    options: { Color: 'Ecru', Size: 'M' },
    price: { amount: 11800, currency: 'USD' },
    lineTotal: { amount: 23600, currency: 'USD' },
    quantity: 2,
  }
  analytics.addToCart(line, 2)
  analytics.removeFromCart(line)
  const [added, removed] = layer()

  assert.equal(added.event, 'add_to_cart')
  assert.equal(added.items[0].item_variant, 'Ecru / M')
  assert.equal(added.items[0].quantity, 2)
  assert.equal(removed.event, 'remove_from_cart')
  assert.equal(removed.value, 236, 'a removal is worth the line, not the unit')
})

test('purchase reports the order, not the cart', () => {
  analytics.purchase({
    number: 'LM-10428',
    total: { amount: 24900, currency: 'USD' },
    shipping: { amount: 0, currency: 'USD' },
    tax: { amount: 1200, currency: 'USD' },
    lines: [{ productSlug: 'wool-overcoat', title: 'Overcoat', quantity: 1, price: { amount: 24900, currency: 'USD' } }],
  })
  const [event] = layer()
  assert.equal(event.event, 'purchase')
  assert.equal(event.transaction_id, 'LM-10428')
  assert.equal(event.value, 249)
  assert.equal(event.tax, 12)
  assert.equal(event.items.length, 1)
})

test('a broken dataLayer never takes the page down', () => {
  // The one place in this codebase where swallowing an error is correct.
  Object.defineProperty(globalThis.window, 'dataLayer', {
    configurable: true,
    get() { throw new Error('blocked by an extension') },
  })
  assert.doesNotThrow(() => analytics.track('view_item', {}))
  delete globalThis.window.dataLayer
})

test('search reports the term and how many came back', () => {
  analytics.search('linen', 7)
  assert.deepEqual(layer()[0], { event: 'search', search_term: 'linen', results: 7 })
})
