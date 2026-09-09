import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shared } from './helpers/browser.mjs'

/**
 * A store seeded by an older version of the theme, then upgraded.
 *
 * This is the failure mode that has bitten twice: the seed gains a field, the
 * loader does not reseed because reseeding would destroy the merchant's work,
 * and the new field never arrives — so the feature looks broken in the browser
 * while being perfectly correct in the data.
 */
const root = new URL('../src/', import.meta.url).pathname
const { products } = await import(`${root}data/catalog.js`)
const { storefront } = await import(`${root}data/storefront.js`)
const { sizeCharts } = await import(`${root}data/fit.js`)

const EDITED = 'A TITLE THE MERCHANT TYPED'

shared.set('loom.db', JSON.stringify({
  version: 5, // several versions behind
  seededAt: '2026-09-01T00:00:00.000Z',
  products: products
    .map((p) => {
      // Strip everything the seed has gained since, at both depths.
      const { assurances: _a, maker: _m, ...enrichment } = p.enrichment || {}
      const next = {
        ...p,
        enrichment,
        images: [
          { id: `${p.slug}-1`, url: `/images/products/${p.slug}-1.jpg`, alt: p.title, width: 900, height: 1125 },
          { id: `${p.slug}-2`, url: `/images/products/${p.slug}-2.jpg`, alt: 'detail', width: 900, height: 1125 },
        ],
        variants: p.variants.map((v) => ({ ...v, imageId: `${p.slug}-1` })),
      }
      if (p.slug === 'oxford-shirt-ecru') {
        next.title = EDITED
        next.enrichment = { ...enrichment, highlights: [{ key: 'fabric', value: 'THEIR OWN VALUE' }] }
      }
      if (p.slug === 'linen-camp-shirt') {
        next.images = [{ id: 'mine-1', url: '/images/mine.jpg', alt: 'THEIR OWN PHOTOGRAPH', color: 'Sand' }]
      }
      return next
    })
    .concat([{ id: 'prod_mine', slug: 'their-own-product', title: 'Theirs', price: { amount: 100, currency: 'USD' }, published: true }]),
  categories: [],
  collections: [],
  sizeCharts: Object.entries(sizeCharts).map(([id, chart]) => ({ id, ...chart })),
  settings: storefront,
}))

const db = await import(`${root}lib/db.js`)
await db.ready()
const api = (await import(`${root}lib/api/index.js`)).default

const oxford = await api.getProduct('oxford-shirt-ecru')

test('a field added inside an existing object still arrives', async () => {
  // A top-level-only merge stops working the moment the seed gains something
  // *inside* a key the store already has — silently, and it looks like the
  // feature not working.
  assert.ok(oxford.enrichment.assurances?.length, 'service rows did not backfill')
  assert.ok(oxford.enrichment.maker?.name, 'the mill did not backfill')
})

test('the merchant\'s edits survive the upgrade', () => {
  assert.equal(oxford.title, EDITED)
  assert.deepEqual(oxford.enrichment.highlights, [{ key: 'fabric', value: 'THEIR OWN VALUE' }])
})

test('a product the merchant created is not dropped', async () => {
  const { items } = await api.adminListProducts({ perPage: 200 })
  assert.ok(items.some((p) => p.slug === 'their-own-product'))
})

test('an untouched gallery adopts the new per-colour photography', () => {
  const tagged = oxford.images.filter((i) => i.color)
  assert.ok(tagged.length >= 2, 'the two-image gallery was never upgraded')
  const black = oxford.variants.find((v) => v.options.Color === 'Black')
  assert.notEqual(black.imageId, 'oxford-shirt-ecru-1', 'variants still point at the single old shot')
})

test('a gallery the merchant curated is left alone', async () => {
  const camp = await api.getProduct('linen-camp-shirt')
  assert.equal(camp.images.length, 1)
  assert.equal(camp.images[0].alt, 'THEIR OWN PHOTOGRAPH')
})

test('everything else still resolves', () => {
  assert.ok(oxford.enrichment.features.length)
  assert.equal(oxford.sizeChart?.id, 'tops')
  assert.ok(oxford.fit && oxford.fabric)
})

test('settings gain new keys without losing configured ones', async () => {
  const config = await api.getStorefront()
  assert.ok(Array.isArray(config.deliveryPolicy) && config.deliveryPolicy.length)
  assert.ok(config.trust?.assurances?.length)
})
