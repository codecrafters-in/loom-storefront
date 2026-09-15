/**
 * Writes real HTML for every route worth indexing.
 *
 *   npm run build     # runs this after `vite build`
 *
 * A single-page app ships `<div id="root"></div>` and assembles the page in the
 * visitor's browser. That is fast enough for a person and invisible to anything
 * that does not run JavaScript: Bing, most social scrapers, and every
 * link-preview bot. For a shop whose products are meant to be found, that is
 * the difference between having a catalogue and having a catalogue nobody can
 * see.
 *
 * Three things have to happen in order, and the middle one is the part every
 * naive prerenderer gets wrong:
 *
 *   1. Build the app twice — once for the browser, once for Node.
 *   2. **Resolve each route's data before rendering it.** Effects do not run in
 *      `renderToString`, so a component that fetches in one renders a skeleton.
 *      Seeding the API cache first is what puts a product in the HTML instead
 *      of a grey box.
 *   3. Inline that same data into the page. Otherwise the browser's first
 *      render — with an empty cache — produces different markup, React calls it
 *      a hydration mismatch, and throws the server's work away at the last step.
 *
 * Only routes that are the same for everybody are prerendered. Cart, checkout,
 * account and admin are per-visitor and stay a single-page app; there is
 * nothing to gain and a stale bag to lose.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { siteUrl } from './lib/site-url.mjs'
import { builtFor } from './lib/build-mode.mjs'
import { installBrowserGlobals } from '../server/globals.mjs'
import { withoutReplacedHead } from '../server/handler.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
// Kept after the build: the render handler (server/handler.mjs) imports it on every host.
const SSR_OUT = path.join(ROOT, 'server-build')
const ORIGIN = siteUrl().origin

/* ── the run ───────────────────────────────────────────────────────────── */

async function main() {
  installBrowserGlobals(ORIGIN)
  const live = builtFor() === 'api'

  console.log('[prerender] building the server bundle')
  await build({
    logLevel: 'warn',
    build: {
      ssr: 'src/entry-server.jsx',
      outDir: path.relative(ROOT, SSR_OUT),
      emptyOutDir: true,
      // Images and icons are dist/'s; the server bundle is code only.
      copyPublicDir: false,
      rollupOptions: { output: { format: 'es' } },
    },
  })

  const { render, prime, routes: plan, smoke } = await import(path.join(SSR_OUT, 'entry-server.js'))

  const raw = await fs.readFile(path.join(DIST, 'index.html'), 'utf8')
  if (!raw.includes('<div id="root"></div>')) {
    throw new Error('dist/index.html has no <div id="root"></div> to render into.')
  }
  // The page every request-time render starts from, before any route is written into dist/index.html.
  await fs.writeFile(path.join(SSR_OUT, 'template.js'), `// Written by scripts/prerender.mjs from dist/index.html.\nexport default ${JSON.stringify(raw)}\n`)

  /**
   * Strip the template's own head tags before adding the route's.
   *
   * A browser keeps the *first* `<title>` it meets, so leaving the fallback in
   * means every prerendered page reports the same one — exactly the problem
   * this script exists to solve, reintroduced two lines from the end.
   */
  const template = raw
    .replace(/^\s*<title>[\s\S]*?<\/title>\n?/m, '')
    .replace(/^\s*<meta (?:name|property)="(?:description|og:title|og:description|og:image|og:type|og:site_name|twitter:card|twitter:title|twitter:description|twitter:image)"[^>]*>\n?/gm, '')

  // A live store renders each page when it is asked for, so a product added after this build is a page too. Only the
  // demo, whose catalogue is in the bundle, is written out as files.
  const routes = live ? [] : await plan()
  let written = 0
  let empty = 0

  for (const route of routes) {
    const payload = await prime(route.reads)

    let rendered
    try {
      rendered = render(route.url, route)
    } catch (err) {
      console.error(`[prerender] ${route.url} threw during render: ${err.message}`)
      process.exitCode = 1
      continue
    }

    // A route that renders nothing is a route that would have been better left
    // as a plain SPA page — say so rather than shipping an empty shell that
    // looks prerendered.
    if (rendered.html.length < 500) empty += 1

    /**
     * The template's own title is stripped, so a route that does not set one
     * ships with none at all — worse than the generic title it replaced. This
     * caught four content pages that had no `Seo` in them.
     */
    if (!rendered.head.includes('<title>')) {
      console.error(`[prerender] ${route.url} rendered no <title> — it needs a <Seo>`)
      process.exitCode = 1
    }

    // The store's icon, colour bar and base fonts, when the route's head has them, in place of the template's.
    const html = withoutReplacedHead(template, rendered.head)
      .replace(
        '</head>',
        `  ${rendered.head}\n    ${seedScript('__LOOM_CACHE__', payload)}` +
          (route.docs ? `\n    ${seedScript('__LOOM_DOCS__', route.docs)}` : '') +
          '\n  </head>',
      )
      .replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>`)

    const file = route.url === '/' ? 'index.html' : `${route.url.replace(/^\//, '')}.html`
    await fs.mkdir(path.join(DIST, path.dirname(file)), { recursive: true })
    await fs.writeFile(path.join(DIST, file), html)
    written += 1
  }

  // Lazy pages are imported from the server bundle.
  // Pages a visitor reaches with a bag or an account are lazy and never prerendered, so nothing above runs them.
  // Render each completely, writing nothing, so a page that throws on its first render fails the build instead of a
  // shopper's checkout.
  for (const url of ['/cart', '/checkout', '/login', '/account', '/wishlist', '/orders/lookup', '/order/preview']) {
    try {
      await smoke(url)
    } catch (err) {
      console.error(`[prerender] ${url} throws when rendered: ${err.message}`)
      process.exitCode = 1
    }
  }
  console.log('[prerender] cart, checkout, sign-in, account, saved items, order lookup and order pages render without errors')

  if (live) {
    // Static files win over the render function on every host: the SPA fallback and the demo's robots.txt would hide it.
    for (const file of ['index.html', '_redirects', 'robots.txt', 'sitemap.xml']) await fs.rm(path.join(DIST, file), { force: true })
    console.log('[prerender] live store: pages render on request (server-build/ + server/handler.mjs), nothing written to dist/')
    return
  }
  console.log(`[prerender] ${written} routes → dist/`)
  if (empty) {
    console.error(`[prerender] ${empty} of them rendered almost nothing — the data did not reach the render`)
    process.exitCode = 1
  }
}

/**
 * `</script>` inside a product description would close this tag early and hand
 * the rest of the catalogue to the HTML parser. Merchants write descriptions.
 */
const seedScript = (name, payload) =>
  `<script>window.${name}=${JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')}</script>`

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
