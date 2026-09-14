import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import './helpers/browser.mjs'

/** Campaign tags and click IDs, captured in the browser and sent with the bag (src/lib/attribution.js). */
const { alreadySent, attribution, captureVisit, markSent } = await import('../src/lib/attribution.js')

const at = (href) => {
  const url = new URL(href)
  return { origin: url.origin, pathname: url.pathname, search: url.search }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

test('a visit with campaign tags is the first and the last visit; a later ad click becomes only the last', () => {
  const first = captureVisit(at('https://shop.test/shop?utm_source=newsletter&utm_medium=email&utm_campaign=Spring'), '', new Date('2026-09-01T10:00:00Z'))
  assert.deepEqual(first, { source: 'newsletter', medium: 'email', campaign: 'Spring', landing: '/shop', at: '2026-09-01T10:00:00.000Z' })
  captureVisit(at('https://shop.test/product/merino?gclid=Cj0-abc'), 'https://www.google.com/', new Date('2026-09-03T10:00:00Z'))

  const payload = attribution(undefined, '_ga=GA1.1.123456789.1712345678; _fbp=fb.1.1712345678901.987')
  assert.equal(payload.first.campaign, 'Spring')
  assert.deepEqual([payload.last.gclid, payload.last.referrer, payload.last.landing], ['Cj0-abc', 'https://www.google.com/', '/product/merino'])
  assert.equal(payload.gaClientId, '123456789.1712345678')
  assert.equal(payload.fbp, 'fb.1.1712345678901.987')
  assert.equal('consent' in payload, false, 'no banner, no consent to send')
  assert.deepEqual(attribution({ analytics: true, marketing: false }, '').consent, { analytics: true, marketing: false })
})

test('a reload or a link inside the shop changes nothing', () => {
  assert.equal(captureVisit(at('https://shop.test/shop'), ''), null)
  assert.equal(captureVisit(at('https://shop.test/shop'), 'https://shop.test/product/x'), null)
  assert.equal(attribution(undefined, ''), null)
})

test('the same attribution is sent once per bag, and again when it changes', () => {
  const payload = { last: { source: 'google' } }
  assert.equal(alreadySent('cart-1', payload), false)
  markSent('cart-1', payload)
  assert.equal(alreadySent('cart-1', payload), true)
  assert.equal(alreadySent('cart-2', payload), false)
  assert.equal(alreadySent('cart-1', { last: { source: 'bing' } }), false)
})
