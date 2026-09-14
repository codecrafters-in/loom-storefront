/**
 * S-12 — Google and WhatsApp fetch a product link: without running JavaScript
 * they see the product's title, description, image, price and structured data.
 *
 * Fetches the raw HTML (no browser) from the storefront as a host serves it:
 * built, with pages rendered on request (support/render-server.mjs), or a
 * deployment named by LOOM_E2E_CRAWL_URL. Includes a product created in Odoo
 * after the build, an unknown address (404), a changed slug (301), and
 * robots.txt and the sitemap passed through from Odoo.
 * Checklist: M1 M2 M3 M6 M7. Gap report §6 (#21 #22 #23): closed in Phase 7.
 */
import { test, expect } from '../support/fixtures.js'
import { settings } from '../support/env.js'
import { readHead } from '../support/html.js'

const CRAWLERS = {
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  whatsapp: 'WhatsApp/2.23.20.0 A',
}

async function crawl(request, path, userAgent = CRAWLERS.google, options = {}) {
  return request.get(`${settings.crawlUrl}${path}`, { headers: { 'User-Agent': userAgent, Accept: 'text/html' }, ...options })
}

test('S-12 crawlers fetching a product URL get its title, description, image, price and Product JSON-LD in the HTML', { tag: '@S-12' }, async ({ request, store, odoo }) => {
  const product = await store.product('e2e-merino-crew')
  const price = (product.price.amount / 100).toFixed(2)

  for (const [crawler, userAgent] of Object.entries(CRAWLERS)) {
    const res = await crawl(request, `/product/${product.slug}`, userAgent)
    expect(res.status(), crawler).toBe(200)
    const head = readHead(await res.text())

    expect.soft(head.title, `${crawler} title`).toContain(product.title)
    expect.soft(head.meta.description, `${crawler} description`).toBeTruthy()
    expect.soft(head.meta['og:title'], `${crawler} og:title`).toContain(product.title)
    expect.soft(head.meta['og:type'], `${crawler} og:type`).toBe('product')
    expect.soft(head.meta['og:image'], `${crawler} og:image`).toMatch(/^https?:\/\//)
    expect.soft(head.canonical, `${crawler} canonical`).toMatch(new RegExp(`/product/${product.slug}$`))

    const schema = head.jsonld.find((item) => item['@type'] === 'Product')
    expect.soft(schema?.name, `${crawler} JSON-LD name`).toBe(product.title)
    const offer = schema?.offers || {}
    expect.soft(offer.priceCurrency, `${crawler} JSON-LD currency`).toBe('USD')
    expect.soft(String(offer.price ?? offer.lowPrice), `${crawler} JSON-LD price`).toMatch(new RegExp(`^${price.replace('.', '\\.')}|^${Number(price)}$`))
  }

  // A product published in Odoo after the storefront was built is a page with its own head, not the home page.
  const name = `E2E Crawl Lamp ${Date.now()}`
  const id = await odoo.create('product.template', { name, list_price: 42, sale_ok: true, is_published: true, type: 'consu' })
  try {
    const [{ loom_slug: slug }] = await odoo.read('product.template', [id], ['loom_slug'])
    const res = await crawl(request, `/product/${slug}`)
    expect(res.status()).toBe(200)
    const head = readHead(await res.text())
    expect(head.title).toContain(name)
    expect(head.jsonld.find((item) => item['@type'] === 'Product')?.name).toBe(name)

    // A changed slug: the old address moves permanently to the new one.
    await odoo.write('product.template', [id], { loom_slug: `${slug}-renamed` })
    const moved = await crawl(request, `/product/${slug}`, CRAWLERS.google, { maxRedirects: 0 })
    expect(moved.status()).toBe(301)
    expect(moved.headers().location).toBe(`/product/${slug}-renamed`)
  } finally {
    await odoo.write('product.template', [id], { active: false })
  }

  const missing = await crawl(request, '/product/e2e-there-is-no-such-product')
  expect(missing.status()).toBe(404)
  expect(missing.headers()['x-robots-tag']).toBe('noindex')

  const robots = await crawl(request, '/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toContain(`Sitemap: `)
  const sitemap = await crawl(request, '/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(await sitemap.text()).toContain('<sitemapindex')
})
