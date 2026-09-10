/**
 * The absolute origin the build writes into canonicals, Open Graph tags, the
 * sitemap and robots.txt.
 *
 * Three scripts need the same answer and used to compute it three ways —
 * `prerender.mjs` read only the environment, `sitemap.mjs` fell back to an
 * example domain, `robots.mjs` fell back to nothing at all. A page whose
 * canonical says one origin and whose sitemap says another is a page Google
 * has to arbitrate.
 *
 * Precedence, most explicit first:
 *
 *   SITE_URL                       an environment variable, for a staging build
 *                                  or a one-off.
 *   storefront.seo.siteUrl         the merchant's own setting, in the theme data.
 *   VERCEL_PROJECT_PRODUCTION_URL  set by Vercel during a build; the production
 *                                  domain, custom one included. It exists so a
 *                                  fork that just clicks deploy still gets
 *                                  canonicals pointing at itself rather than at
 *                                  an example domain nobody owns — which is the
 *                                  one wrong answer that is worse than none.
 *
 * The placeholder is last and is announced, because a shop that canonicalises
 * itself to `loom.example` disappears from search silently.
 */
import { storefront } from '../../src/data/storefront.js'

const clean = (value) => String(value || '').trim().replace(/\/+$/, '')

export function siteUrl() {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const candidates = [
    ['SITE_URL', clean(process.env.SITE_URL)],
    ['storefront.seo.siteUrl', clean(storefront.seo?.siteUrl)],
    ['Vercel', vercel ? `https://${clean(vercel)}` : ''],
  ]

  for (const [source, origin] of candidates) if (origin) return { origin, source, real: true }
  return { origin: 'https://loom.example', source: 'placeholder', real: false }
}

/** Say it once per script, so a wrong origin is visible in the build log. */
export function announceSiteUrl(tag) {
  const { origin, source, real } = siteUrl()
  if (!real) {
    console.warn(
      `[${tag}] no site URL — using ${origin}. Set SITE_URL, or Settings → SEO → Site URL, before going live.`,
    )
  }
  return { origin, source, real }
}
