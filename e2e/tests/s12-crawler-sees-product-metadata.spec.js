/**
 * S-12 — Google and WhatsApp fetch a product link: without running JavaScript
 * they see the product's title, description, image, price and structured data.
 *
 * Fetches the raw HTML (no browser). Against the dev server this is the case of
 * a product added in Odoo after the storefront was built; point
 * LOOM_E2E_CRAWL_URL at a deployment to check that instead.
 * Checklist: M1 M2 M6 M7. Gap report §6: 🟡 — only products present at build
 * time; new ones get the home page (#23).
 */
import { test, expect, gaps } from '../support/fixtures.js'
import { settings } from '../support/env.js'
import { readHead } from '../support/html.js'

const CRAWLERS = {
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  whatsapp: 'WhatsApp/2.23.20.0 A',
}

test.fail(
  'S-12 crawlers fetching a product URL get its title, description, image, price and Product JSON-LD in the HTML',
  gaps(
    '@S-12',
    '#23 product/category URLs not prerendered at build are served the home page HTML (SPA fallback)',
    '#8 index.html meta is the LOOM demo copy ("Considered clothing")',
  ),
  async ({ request, store }) => {
    const product = await store.product('e2e-merino-crew')
    const price = (product.price.amount / 100).toFixed(2)

    for (const [crawler, userAgent] of Object.entries(CRAWLERS)) {
      const res = await request.get(`${settings.crawlUrl}/product/${product.slug}`, {
        headers: { 'User-Agent': userAgent, Accept: 'text/html' },
      })
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
  },
)
