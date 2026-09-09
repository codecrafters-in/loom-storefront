import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import api, { peek } from './lib/api/index.js'
import { keyOf } from './lib/api/cache.js'
import { startCollecting, stopCollecting, renderHead } from './lib/head.js'

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

/** What there is to prerender. Read here so the build script owns no data. */
export async function catalogue() {
  const [products, categories, collections] = await Promise.all([
    api.listProducts({ perPage: 500 }),
    api.listCategories(),
    api.listCollections(),
  ])
  return {
    products: products.items.map((p) => p.slug),
    categories: categories.items.flatMap((c) => [c.slug, ...(c.children || []).map((x) => x.slug)]),
    collections: collections.items.map((c) => c.slug),
  }
}

/**
 * `StaticRouter` rather than `BrowserRouter`, and no `StrictMode` — a double
 * render would collect every head tag twice.
 */
export function render(url) {
  startCollecting()
  try {
    const html = renderToString(
      <StaticRouter location={url}>
        <App />
      </StaticRouter>,
    )
    return { html, head: renderHead(stopCollecting()) }
  } catch (err) {
    stopCollecting()
    throw err
  }
}
