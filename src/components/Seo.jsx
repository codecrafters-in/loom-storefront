import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { applyHead, collecting, record } from '../lib/head.js'
import { buildHead, structuredData } from '../lib/seo.js'
import * as serverSchemas from '../lib/schema.js'
import { addressPrefix } from '../i18n/index.js'

/**
 * Per-route title, description, canonical, language alternates, Open Graph and structured data.
 *
 * A single-page app serves one `index.html`, so without this every URL in the sitemap shares one title — which is the
 * first thing a merchant's marketer raises and the last thing anyone notices while building.
 *
 * The head is built as *data* and then either applied to a real document or handed to the server render (the
 * prerenderer, or the render handler at request time). Google executes JavaScript and would eventually read tags set
 * in an effect; no other crawler and no link-preview scraper does.
 *
 * Recording during render rather than in an effect is deliberate and is the only way this can work: effects do not run
 * during a server render, so a head assembled in one is a head the server never sees.
 *
 * `seo` is the backend's own block for the page (`{title, description, image, noindex}`): its title is final (the
 * store's title template already applied) and wins over the props. `product`, `breadcrumbs`, `itemList`, `article`
 * and `site` add structured data.
 */
// The server render builds structured data with the page, because crawlers read it there. In the browser its code is a
// separate chunk loaded after the page shows (a constant, so the bundler leaves it out of the first download).
const SCHEMAS = import.meta.env?.SSR ? serverSchemas : null

export default function Seo({
  title, description, image, type = 'website', product, noindex = false, seo, breadcrumbs, itemList, article, site = false,
}) {
  const config = useStorefront()
  const { pathname } = useLocation()
  const prefix = addressPrefix()

  const input = useMemo(
    () => ({ title, description, image, type, product, noindex, seo, breadcrumbs, itemList, article, site, pathname, prefix, config }),
    [title, description, image, type, product, noindex, seo, breadcrumbs, itemList, article, site, pathname, prefix, config],
  )
  const tags = useMemo(() => buildHead(input, SCHEMAS), [input])

  // During a server render there is no document and no effect. Collect instead.
  if (collecting()) record(tags)

  useEffect(() => {
    applyHead(tags)
    if (SCHEMAS) return undefined
    let alive = true
    import('../lib/schema.js')
      .then((schemas) => alive && applyHead([structuredData(input, schemas)]))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [tags, input])

  return null
}

export { buildHead, titled } from '../lib/seo.js'
