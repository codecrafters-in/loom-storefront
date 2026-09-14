import { test } from 'node:test'
import assert from 'node:assert/strict'
import './helpers/browser.mjs'

/** The analytics and ad tags a merchant switches on in Odoo (src/lib/tags.js), and the consent they need. */
const { CATEGORY, translate } = await import('../src/lib/tags.js')
const analytics = await import('../src/lib/analytics.js')

const purchase = {
  transaction_id: 'S00042', value: 120, currency: 'USD',
  items: [{ item_id: 'merino-crew', item_name: 'Merino Crew', quantity: 2, price: 60 }],
}

test('a purchase carries the order reference as its event ID on every ad platform, as Odoo reports it', () => {
  const meta = translate('metaPixel', 'purchase', purchase)
  assert.deepEqual([meta[0], meta[1], meta[3]], ['track', 'Purchase', { eventID: 'S00042' }])
  assert.deepEqual([meta[2].content_ids, meta[2].value, meta[2].num_items], [['merino-crew'], 120, 2])

  const tiktok = translate('tiktok', 'purchase', purchase)
  assert.deepEqual([tiktok[1], tiktok[3]], ['CompletePayment', { event_id: 'S00042' }])
  const pinterest = translate('pinterest', 'purchase', purchase)
  assert.deepEqual([pinterest[1], pinterest[2].order_id, pinterest[2].order_quantity], ['checkout', 'S00042', 2])

  assert.deepEqual(translate('ga4', 'purchase', purchase), ['event', 'purchase', purchase])
  assert.equal(translate('gtm', 'purchase', purchase), null, 'Tag Manager reads the dataLayer itself')
  assert.equal(translate('metaPixel', 'view_item_list', {}), null, 'no such event on Meta')
  assert.deepEqual(translate('tiktok', 'page_view', {}), ['page'])
  assert.deepEqual(translate('metaPixel', 'search', { search_term: 'wool' })[2], { search_string: 'wool' })
})

test('Google counts as analytics and the ad platforms as marketing; the bag carries consent only with a banner', () => {
  assert.deepEqual(CATEGORY, { ga4: 'analytics', gtm: 'analytics', metaPixel: 'marketing', tiktok: 'marketing', pinterest: 'marketing' })
  analytics.configureAnalytics({ enabled: true, respectDoNotTrack: false, consentEnabled: false, consentRequired: false })
  analytics.setConsent(null)
  assert.equal(analytics.consentState(), undefined)

  analytics.configureAnalytics({ consentEnabled: true, consentRequired: true })
  assert.deepEqual(analytics.consentState(), { analytics: false, marketing: false }, 'opt-in: nothing until the visitor agrees')
  analytics.setConsent(true, false)
  assert.deepEqual(analytics.consentState(), { analytics: true, marketing: false })
  analytics.setConsent(false)
  assert.deepEqual(analytics.consentState(), { analytics: false, marketing: false })
})

test('events sent before the store settings arrive are kept, then sent to the store tags', async () => {
  const early = await import('../src/lib/analytics.js?before-settings')
  globalThis.window.dataLayer = []
  early.pageView('/product/merino-crew')
  early.viewItem({ slug: 'merino-crew', title: 'Merino Crew', price: { amount: 9000, currency: 'USD' } })
  assert.equal(globalThis.window.dataLayer.length, 0, 'nothing decided yet')
  early.configureAnalytics({ enabled: true, respectDoNotTrack: false })
  assert.deepEqual(globalThis.window.dataLayer.map((entry) => entry.event), ['page_view', 'view_item'])
})
