// A namespace import: worker runtimes resolve react-dom/server to a build without renderToPipeableStream.
import * as ReactDOMServer from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import api, { peek } from './lib/api/index.js'
import { clearAll, keyOf } from './lib/api/cache.js'
import { startCollecting, stopCollecting, renderHead } from './lib/head.js'
import { filtersFromParams, listingQuery } from './pages/Shop.jsx'
import { loadDoc } from './pages/Docs.jsx'
import { docPages, docPath } from './data/docs.js'
import { flattenCategories } from './lib/categories.js'
import { config, isMock } from './lib/config.js'
import { currentLanguage, isRightToLeft, languageFromPath, setLanguage } from './i18n/index.js'
import { fontsHref, themeCss } from './lib/theme.js'

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
  const [products, categories, collections, brands, pages] = await Promise.all([
    api.listProducts({ perPage: 500 }),
    api.listCategories(),
    api.listCollections(),
    api.listBrands(),
    api.listPages(),
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
    // The store's own pages, from the backend.
    ...pages.items.map((p) => ({ url: `/pages/${p.slug}`, reads: [['getPage', [p.slug]]] })),
    /**
     * The documentation reads from disk rather than from the API, so it seeds
     * itself: the markdown travels with the page it produced, and the first
     * client render finds the same text the server did.
     */
    ...(!isMock ? [] : await Promise.all(
      docPages.map(async (d) => ({
        url: docPath(d.slug),
        reads: [],
        docs: { [d.slug]: await loadDoc(d.slug) },
      })),
    )),
  ]
}

/* ── at request time: server/handler.mjs ──────────────────────────────── */

/** The API the render handler asks about redirects and passes robots.txt and sitemaps from; '' on the demo data. */
export const apiBaseUrl = isMock ? '' : config.api.baseUrl
/** Where the browser sends error reports, for the page's Content-Security-Policy. */
export const sentryDsn = config.monitoring.sentryDsn

// Different for every visitor: the app's shell, rendered in their browser and never cached.
const PRIVATE = /^\/(?:cart|checkout|order|orders|login|account|wishlist|search|compare|admin)(?:\/|$)/

const listing = (params, extra) => ['listProducts', [listingQuery({ ...filtersFromParams(params), ...extra })]]

/**
 * What a public address reads before it can render, or `null` when the address is nothing.
 *
 * The reads are the calls the page makes with the same arguments, so the browser finds the data under the keys its
 * components ask for. A 404 from the API on the thing the address names (a product, a page) is thrown and means the
 * address is nothing.
 */
async function readsFor(path, params, boot) {
  const [, section = '', slug, ...rest] = path.split('/')
  if (rest.length) return null
  if (path === '/') return []
  if (section === 'shop') {
    if (!slug) return [listing(params, {})]
    const tree = boot?.categories || (await api.listCategories()).items
    return flattenCategories(tree).some((c) => c.slug === slug) ? [listing(params, { category: slug })] : null
  }
  if (section === 'collections' && slug) {
    const { items } = await api.listCollections()
    return items.some((c) => c.slug === slug) ? [listing(params, { collection: slug }), ['listCollections', []]] : null
  }
  if (section === 'brands') {
    if (!slug) return [['listBrands', []]]
    await api.getBrand(slug)
    return [listing(params, { inBrand: slug }), ['getBrand', [slug]]]
  }
  if (section === 'product' && slug) {
    await api.getProduct(slug)
    return [['getProduct', [slug]]]
  }
  if (section === 'pages' && slug) {
    await api.getPage(slug)
    return [['getPage', [slug]]]
  }
  if (section === 'blog') {
    if (slug) {
      await api.getBlogPost(slug)
      return [['getBlogPost', [slug]]]
    }
    const query = { page: Number(params.get('page')) || 1, perPage: 12, tag: params.get('tag') || undefined }
    await api.listBlogPosts(query)
    return [['listBlogPosts', [query]]]
  }
  if (section === '404') return null
  return null
}

/**
 * One address, rendered for the request that asked for it.
 *
 * Answers `{kind, html, head, payload, language, direction, prefix, path, seedLanguage}`: `kind` is `page`,
 * `not-found` (rendered as the not-found page; `path` is what to look up in the redirect table), `private` (the
 * shell), or `maintenance`. The handler turns that into a status and headers. It runs one request at a time, because
 * the API cache and the language here are module state, as they are in a browser tab.
 */
export async function page(target) {
  const url = new URL(target, 'http://storefront.local')
  const prefix = languageFromPath(url.pathname)
  const path = (prefix ? url.pathname.slice(prefix.length + 1) : url.pathname).replace(/(.)\/+$/, '$1') || '/'
  const basename = prefix ? `/${prefix}` : undefined

  clearAll()
  await setLanguage(prefix || 'en', { address: Boolean(prefix) })
  const about = () => ({ prefix, path, language: currentLanguage(), direction: isRightToLeft() ? 'rtl' : 'ltr' })
  if (PRIVATE.test(path)) return { kind: 'private', ...about() }

  let boot
  try {
    boot = await api.getBootstrap()
  } catch (err) {
    if (err.code === 'store_maintenance') return { kind: 'maintenance', ...about() }
    if (err.code === 'store_locked') return { kind: 'private', ...about() }
    throw err
  }
  // No language in the address: the store's default, as the browser will show it (seeded so it starts in it too).
  let seedLanguage
  const preferred = boot?.storefront?.i18n?.default
  if (!prefix && preferred && preferred !== currentLanguage()) {
    await setLanguage(preferred)
    if (currentLanguage() !== 'en') seedLanguage = currentLanguage()
  }

  let reads
  try {
    reads = await readsFor(path, url.searchParams, boot)
  } catch (err) {
    if (err.status !== 404) throw err
    reads = null
  }
  const payload = await prime(reads || [])
  const location = reads ? `${url.pathname}${url.search}` : `${basename || ''}/404`
  const { html, head } = render(location, { basename })
  return { kind: reads ? 'page' : 'not-found', html, head, payload, seedLanguage, ...about() }
}

/**
 * `StaticRouter` rather than `BrowserRouter`, and no `StrictMode` — a double
 * render would collect every head tag twice.
 */
export function render(url, { docs, basename } = {}) {
  globalThis.__LOOM_DOCS__ = docs
  startCollecting()
  try {
    const html = ReactDOMServer.renderToString(
      <StaticRouter basename={basename} location={url} future={{ v7_relativeSplatPath: true }}>
        <App />
      </StaticRouter>,
    )
    const head = renderHead(stopCollecting())
    // The store's colours and fonts in the page itself, so the first paint is already in them.
    const theme = peek.getBootstrap()?.storefront?.theme
    const css = themeCss(theme)
    const fonts = fontsHref(theme)
    const style = (css ? `<style id="loom-theme">${css}</style>` : '') + (fonts ? `<link rel="stylesheet" href="${fonts}" data-loom-fonts="1" />` : '')
    return { html, head: style + head }
  } catch (err) {
    stopCollecting()
    throw err
  } finally {
    globalThis.__LOOM_DOCS__ = undefined
  }
}

/**
 * Render a route completely, lazy pages included, only to find out whether it throws.
 *
 * `render` uses `renderToString`, which paints a lazy page's fallback and never runs the page. The pages a visitor
 * reaches with a bag or an account (checkout, cart, sign-in) are all lazy and never prerendered, so a crash in their
 * first render (a variable used before it is declared, say) reached a browser without any build step running that
 * code. This streams the route and waits for every lazy page, then resolves with the size of the HTML or rejects
 * with the first error.
 */
export async function smoke(url) {
  const { Writable } = await import('node:stream')
  return new Promise((resolve, reject) => {
    let failure = null
    const { pipe } = ReactDOMServer.renderToPipeableStream(
      <StaticRouter location={url} future={{ v7_relativeSplatPath: true }}>
        <App />
      </StaticRouter>,
      {
        onAllReady() {
          if (failure) return reject(failure)
          let size = 0
          pipe(new Writable({
            write(chunk, _encoding, done) {
              size += chunk.length
              done()
            },
            final(done) {
              resolve(size)
              done()
            },
          }))
        },
        onShellError: reject,
        onError(err) {
          failure = failure || err
        },
      },
    )
  })
}
