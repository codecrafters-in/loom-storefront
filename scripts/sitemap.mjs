/**
 * Writes dist/sitemap.xml after a build.
 *
 * Only the routes worth indexing: cart, checkout and account are per-visitor
 * and are excluded here as well as in robots.txt.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { products, categories, collections } from '../src/data/catalog.js'
import { storefront } from '../src/data/storefront.js'
import { docPages, docPath } from '../src/data/docs.js'
import { announceSiteUrl } from './lib/site-url.mjs'
import { builtFor } from './lib/build-mode.mjs'

// A live store's sitemap.xml is Odoo's, from its catalogue as it is now; the render handler serves it (server/handler.mjs).
if (builtFor() === 'api') {
  console.log('[sitemap] live store: sitemap.xml comes from Odoo through the render handler')
  process.exit(0)
}


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seo = storefront.seo || {}
const BASE = announceSiteUrl('sitemap').origin
const today = new Date().toISOString().slice(0, 10)

const urls = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/shop', priority: '0.9', changefreq: 'daily' },
  { loc: '/search', priority: '0.3', changefreq: 'monthly' },
  ...categories.map((c) => ({ loc: `/shop/${c.slug}`, priority: c.parent ? '0.7' : '0.8', changefreq: 'weekly' })),
  ...collections.map((c) => ({ loc: `/collections/${c.slug}`, priority: '0.8', changefreq: 'weekly' })),
  /**
   * Product entries carry their photographs.
   *
   * Google Images is a shopping surface in its own right and it will not find
   * 112 pictures that only exist inside a JavaScript-rendered gallery. This is
   * the whole cost of appearing there.
   */
  ...products.map((p) => ({
    loc: `/product/${p.slug}`,
    priority: '0.8',
    changefreq: 'weekly',
    images: seo.sitemapImages === false ? [] : (p.images || []).filter((i) => i.type !== 'video'),
  })),
  ...['size-guide', 'shipping', 'care', 'contact'].map((s) => ({ loc: `/pages/${s}`, priority: '0.4', changefreq: 'monthly' })),
  // The documentation is public and prerendered, so it is indexable — and it
  // is what somebody evaluating the theme searches for before they search for
  // the shop.
  ...docPages.map((d) => ({ loc: docPath(d.slug), priority: d.slug === 'readme' ? '0.6' : '0.5', changefreq: 'monthly' })),
]

/** `&` in a caption or a filename would otherwise break the document. */
const xmlEscape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const imageTags = (images = []) =>
  images
    .map(
      (img) =>
        `\n    <image:image><image:loc>${BASE}${xmlEscape(img.url)}</image:loc>` +
        (img.alt ? `<image:title>${xmlEscape(img.alt)}</image:title>` : '') +
        `</image:image>`,
    )
    .join('')

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map(
    (u) =>
      `  <url><loc>${BASE}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority>${imageTags(u.images)}</url>`,
  )
  .join('\n')}
</urlset>
`

await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true })
await fs.writeFile(path.join(ROOT, 'dist/sitemap.xml'), xml)
const imageCount = urls.reduce((a, u) => a + (u.images?.length || 0), 0)
console.log(`[sitemap] ${urls.length} urls, ${imageCount} images → dist/sitemap.xml`)
