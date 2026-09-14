import { test } from 'node:test'
import assert from 'node:assert/strict'
import './helpers/browser.mjs'

/**
 * The head a page gets (src/lib/seo.js): what a crawler reads before any JavaScript runs, from the server render.
 */
const { buildHead: build, titled } = await import('../src/lib/seo.js')
const schemas = await import('../src/lib/schema.js')
const buildHead = (props) => build(props, schemas)

const base = 'https://shop.example.com'
const meta = (tags, key) => tags.find((tag) => tag.kind === 'meta' && tag.key === key)?.content
const link = (tags, rel) => tags.find((tag) => tag.kind === 'link' && tag.rel === rel && !tag.hreflang)?.href
const title = (tags) => tags.find((tag) => tag.kind === 'title').text
const jsonld = (tags) => tags.find((tag) => tag.kind === 'jsonld').data

const config = {
  store: {
    name: 'Test Store', tagline: 'Wool, well made', logo: { imageUrl: '/logo.png' },
    contact: { social: [{ network: 'instagram', url: 'https://instagram.com/test' }] },
  },
  seo: { titleTemplate: '{title} | {store}', title: 'Knitwear that lasts', description: 'Home description', indexable: true },
  i18n: { languages: [{ code: 'en_US', urlCode: 'en' }, { code: 'fr_FR', urlCode: 'fr' }], default: 'en' },
  commerce: { returnsWindowDays: 30, countries: [['US', 'United States'], ['CA', 'Canada']], freeShippingOver: 10000 },
  features: {},
}

test("the backend's title is final; without one the store's template names the page; the home page has its own", () => {
  const own = buildHead({
    seo: { title: 'Merino Crew – soft wool', description: 'From Odoo', image: 'https://odoo.test/img.jpg', noindex: false },
    title: 'Merino Crew', pathname: '/product/merino-crew', config, origin: base,
  })
  assert.equal(title(own), 'Merino Crew – soft wool')
  assert.equal(meta(own, 'description'), 'From Odoo')
  assert.equal(meta(own, 'og:image'), 'https://odoo.test/img.jpg')

  assert.equal(title(buildHead({ title: 'Your bag', pathname: '/cart', config, origin: base })), 'Your bag | Test Store')
  assert.equal(titled('Your bag', 'Test Store'), 'Your bag — Test Store', 'without a template, as before')
  assert.equal(title(buildHead({ pathname: '/', config, origin: base, site: true })), 'Knitwear that lasts')
})

test('the canonical and the language alternates keep the address prefix; a noindex page has no alternates', () => {
  const tags = buildHead({ title: 'Shop', pathname: '/shop', prefix: '/fr', config, origin: base })
  assert.equal(link(tags, 'canonical'), `${base}/fr/shop`)
  const alternates = Object.fromEntries(tags.filter((tag) => tag.rel === 'alternate').map((tag) => [tag.hreflang, tag.href]))
  assert.deepEqual(alternates, { en: `${base}/shop`, fr: `${base}/fr/shop`, 'x-default': `${base}/shop` })
  assert.equal(link(buildHead({ pathname: '/', prefix: '/fr', config, origin: base }), 'canonical'), `${base}/fr`)

  const hidden = buildHead({ pathname: '/product/x', seo: { title: 'x', noindex: true }, config, origin: base })
  assert.equal(meta(hidden, 'robots'), 'noindex, nofollow')
  assert.equal(hidden.filter((tag) => tag.rel === 'alternate').length, 0)
})

test('a product offers each variant with its barcode, the returns window, and free delivery only over the threshold', () => {
  const product = {
    title: 'Merino Crew', description: 'Soft', price: { amount: 9000, currency: 'USD' }, brand: { name: 'Loom Mills' },
    images: [{ url: '/a.jpg' }], rating: { count: 0 },
    variants: [
      { sku: 'MC-S', barcode: '5099999000017', options: { Size: 'S' }, price: { amount: 9000, currency: 'USD' }, available: true },
      { sku: 'MC-L', barcode: '5099999000024', options: { Size: 'L' }, price: { amount: 12000, currency: 'USD' }, available: false },
    ],
  }
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Knitwear', path: '/shop/knitwear' }, { name: 'Merino Crew' }]
  const graph = jsonld(buildHead({ title: product.title, product, breadcrumbs: crumbs, pathname: '/product/merino-crew', config, origin: base }))['@graph']
  const schema = graph.find((node) => node['@type'] === 'Product')
  assert.equal(schema.brand.name, 'Loom Mills')
  assert.deepEqual(schema.image, [`${base}/a.jpg`])
  assert.equal(schema.offers['@type'], 'AggregateOffer')
  assert.deepEqual([schema.offers.lowPrice, schema.offers.highPrice, schema.offers.priceCurrency], [90, 120, 'USD'])
  const [small, large] = schema.offers.offers
  assert.deepEqual([small.gtin, small.sku, small.name, small.availability], ['5099999000017', 'MC-S', 'S', 'https://schema.org/InStock'])
  assert.equal(large.availability, 'https://schema.org/OutOfStock')
  assert.equal(small.hasMerchantReturnPolicy.merchantReturnDays, 30)
  assert.deepEqual(small.hasMerchantReturnPolicy.applicableCountry, ['US', 'CA'])
  assert.equal(small.shippingDetails, undefined, '90.00 is under the 100.00 free delivery threshold')
  assert.equal(large.shippingDetails.shippingRate.value, 0)
  assert.equal(schema.aggregateRating, undefined, 'no reviews, no rating')

  const trail = graph.find((node) => node['@type'] === 'BreadcrumbList')
  assert.deepEqual(trail.itemListElement.map((item) => item.item), [`${base}/`, `${base}/shop/knitwear`, undefined])
})

test('the home page says who the store is and how to search it; a single thing needs no graph', () => {
  const [organization, website] = jsonld(buildHead({ pathname: '/', config, origin: base, site: true }))['@graph']
  assert.equal(organization.logo, `${base}/logo.png`)
  assert.deepEqual(organization.sameAs, ['https://instagram.com/test'])
  assert.equal(website.potentialAction.target.urlTemplate, `${base}/search?q={search_term_string}`)

  const single = jsonld(buildHead({ title: 'P', product: { title: 'P', price: { amount: 100, currency: 'USD' }, variants: [] }, pathname: '/product/p', config, origin: base }))
  assert.equal(single['@type'], 'Product')
  assert.equal(single['@context'], 'https://schema.org')

  const list = jsonld(buildHead({ title: 'Knitwear', itemList: [{ slug: 'a', title: 'A' }, { slug: 'b', title: 'B' }], pathname: '/shop/knitwear', prefix: '/fr', config, origin: base }))
  assert.deepEqual(list.itemListElement.map((item) => item.url), [`${base}/fr/product/a`, `${base}/fr/product/b`])
})

test('without the structured data builders (a browser, before they load) the head has no JSON-LD tag', () => {
  const tags = build({ title: 'P', product: { title: 'P', price: { amount: 100, currency: 'USD' } }, pathname: '/product/p', config, origin: base })
  assert.equal(tags.some((tag) => tag.kind === 'jsonld'), false)
  assert.equal(link(tags, 'canonical'), `${base}/product/p`)
})
