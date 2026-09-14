import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import api, { peek } from './lib/api/index.js'
import { keyOf } from './lib/api/cache.js'
import { startCollecting, stopCollecting, renderHead } from './lib/head.js'
import { listingQuery } from './pages/Shop.jsx'
import { loadDoc } from './pages/Docs.jsx'
import { docPages, docPath } from './data/docs.js'
import { flattenCategories } from './lib/categories.js'

/**
 * One route, rendered to HTML at build time.
 *
 * Priming lives here rather than in the build script, and that is not a
 * stylistic choice. A Vite SSR bundle is its own module graph: the cache the
 * script would fill by calling the API is a *different instance* from the one
 * the components read, so the render finds nothing and paints skeletons. Doing
 * both on this side of the boundary makes that impossible.
 */

/** Resolve what a route reads, and hand back the payload to inline in the page. */
export async function prime(reads = []) {
  await api.getBootstrap()
  // A read that fails still renders — a product page whose reviews are down is
  // a product page, and refusing to prerender it helps nobody.
  await Promise.all(reads.map(([name, args]) => api[name](...args).catch(() => null)))

  const payload = { [keyOf('getBootstrap', [])]: peek.getBootstrap() }
  for (const [name, args] of reads) {
    const value = peek[name](...args)
    if (value !== undefined) payload[keyOf(name, args)] = value
  }
  return payload
}

/**
 * Which routes to prerender, and what each one has to read first.
 *
 * Here rather than in the build script, so the listing query comes from the
 * page that makes it. A second copy in the script is what produced a
 * `maxPrice: null` against the page's `undefined` — a different cache key, no
 * match, and a silently empty grid on every category page.
 */
export async function routes() {
  const [products, categories, collections, brands] = await Promise.all([
    api.listProducts({ perPage: 500 }),
    api.listCategories(),
    api.listCollections(),
    api.listBrands(),
  ])
  // Any depth: a third-level category is a page like any other.
  const flatCategories = flattenCategories(categories.items)
  const listing = (extra) => [['listProducts', [listingQuery(extra)]]]

  return [
    { url: '/', reads: [] },
    { url: '/shop', reads: listing({}) },
    ...flatCategories.map((c) => ({ url: `/shop/${c.slug}`, reads: listing({ category: c.slug }) })),
    // The heading and title come from the collection record, not the listing.
    ...collections.items.map((c) => ({
      url: `/collections/${c.slug}`,
      reads: [...listing({ collection: c.slug }), ['listCollections', []]],
    })),
    // A brand is the page's scope (`inBrand`), and its name and description come from the brand record.
    ...brands.items.map((b) => ({
      url: `/brands/${b.slug}`,
      reads: [...listing({ inBrand: b.slug }), ['getBrand', [b.slug]]],
    })),
    ...products.items.map((p) => ({
      url: `/product/${p.slug}`,
      reads: [
        ['getProduct', [p.slug]],
        ['getRelated', [p.slug, { limit: 4, strategy: 'automatic' }]],
        ['getReviews', [p.slug]],
      ],
    })),
    ...['size-guide', 'shipping', 'care', 'contact'].map((slug) => ({ url: `/pages/${slug}`, reads: [] })),
    /**
     * The documentation reads from disk rather than from the API, so it seeds
     * itself: the markdown travels with the page it produced, and the first
     * client render finds the same text the server did.
     */
    ...(await Promise.all(
      docPages.map(async (d) => ({
        url: docPath(d.slug),
        reads: [],
        docs: { [d.slug]: await loadDoc(d.slug) },
      })),
    )),
  ]
}

/**
 * `StaticRouter` rather than `BrowserRouter`, and no `StrictMode` — a double
 * render would collect every head tag twice.
 */
export function render(url, { docs } = {}) {
  globalThis.__LOOM_DOCS__ = docs
  startCollecting()
  try {
    const html = renderToString(
      <StaticRouter location={url} future={{ v7_relativeSplatPath: true }}>
        <App />
      </StaticRouter>,
    )
    return { html, head: renderHead(stopCollecting()) }
  } catch (err) {
    stopCollecting()
    throw err
  } finally {
    globalThis.__LOOM_DOCS__ = undefined
  }
}
