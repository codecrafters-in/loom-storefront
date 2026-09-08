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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SITE_URL || 'https://loom.example'
const today = new Date().toISOString().slice(0, 10)

const urls = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/shop', priority: '0.9', changefreq: 'daily' },
  { loc: '/search', priority: '0.3', changefreq: 'monthly' },
  ...categories.map((c) => ({ loc: `/shop/${c.slug}`, priority: c.parent ? '0.7' : '0.8', changefreq: 'weekly' })),
  ...collections.map((c) => ({ loc: `/collections/${c.slug}`, priority: '0.8', changefreq: 'weekly' })),
  ...products.map((p) => ({ loc: `/product/${p.slug}`, priority: '0.8', changefreq: 'weekly' })),
  ...['size-guide', 'shipping', 'care', 'contact'].map((s) => ({ loc: `/pages/${s}`, priority: '0.4', changefreq: 'monthly' })),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${BASE}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
  )
  .join('\n')}
</urlset>
`

await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true })
await fs.writeFile(path.join(ROOT, 'dist/sitemap.xml'), xml)
console.log(`[sitemap] ${urls.length} urls → dist/sitemap.xml`)
