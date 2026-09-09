/**
 * Writes dist/robots.txt from the store's own settings.
 *
 * It used to be a static file, which made one of its lines a decision the theme
 * had taken on the merchant's behalf: whether an AI crawler may read their
 * catalogue. That is a business question — some stores want the traffic an
 * assistant sends them, some do not want their photography and copy in a
 * training set — and the answer belongs in Settings, not in a file somebody has
 * to know to edit.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storefront } from '../src/data/storefront.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seo = storefront.seo || {}
const base = (process.env.SITE_URL || seo.siteUrl || '').replace(/\/$/, '')

const lines = []

if (seo.indexable === false) {
  // A staging deployment that is indexed is a staging deployment competing with
  // production for its own keywords.
  lines.push('# Indexing is switched off in Settings → SEO.', 'User-agent: *', 'Disallow: /')
} else {
  lines.push('User-agent: *', 'Allow: /')
  for (const path_ of seo.disallow || []) lines.push(`Disallow: ${path_}`)

  const mode = seo.aiCrawlers || 'allow'
  const decisions = Object.entries(seo.crawlers || {})

  if (mode !== 'allow' && decisions.length) {
    lines.push('', '# AI crawlers — set in Settings → SEO.')
    for (const [bot, allowed] of decisions) {
      // In `block`, every named bot is refused regardless of its own flag. In
      // `custom`, each one is honoured. Stating both explicitly beats silence:
      // an absent rule means "allowed", and nobody reading the file can tell
      // whether that was a decision or an oversight.
      const permit = mode === 'block' ? false : allowed
      lines.push('', `User-agent: ${bot}`, permit ? 'Allow: /' : 'Disallow: /')
    }
  }
}

if (base) lines.push('', `Sitemap: ${base}/sitemap.xml`)
else lines.push('', 'Sitemap: /sitemap.xml')

await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true })
await fs.writeFile(path.join(ROOT, 'dist/robots.txt'), `${lines.join('\n')}\n`)
console.log(`[robots] ${seo.indexable === false ? 'noindex' : `ai crawlers: ${seo.aiCrawlers || 'allow'}`} → dist/robots.txt`)
