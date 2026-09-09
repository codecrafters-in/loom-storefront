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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const SSR_OUT = path.join(ROOT, 'node_modules/.loom-ssr')
const ORIGIN = (process.env.SITE_URL || 'https://loom.example').replace(/\/$/, '')

/* ── a browser, for Node ───────────────────────────────────────────────── */

/**
 * The storefront reads `localStorage` and dispatches `storage` events. None of
 * that exists here, and none of it is worth a jsdom dependency — the demo
 * backend needs somewhere to keep a catalogue, and nothing more.
 */
function installBrowserGlobals() {
  const store = (map) => ({
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  })
  globalThis.localStorage = store(new Map())
  globalThis.sessionStorage = store(new Map())
  globalThis.window = {
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    location: { origin: ORIGIN, search: '', href: `${ORIGIN}/` },
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  }
  globalThis.document = { addEventListener() {}, removeEventListener() {}, body: { style: {} } }
}

/* ── the run ───────────────────────────────────────────────────────────── */

async function main() {
  installBrowserGlobals()

  console.log('[prerender] building the server bundle')
  await build({
    logLevel: 'warn',
    build: {
      ssr: 'src/entry-server.jsx',
      outDir: path.relative(ROOT, SSR_OUT),
      emptyOutDir: true,
      rollupOptions: { output: { format: 'es' } },
    },
  })

  const { render, prime, routes: plan } = await import(path.join(SSR_OUT, 'entry-server.js'))

  const raw = await fs.readFile(path.join(DIST, 'index.html'), 'utf8')
  if (!raw.includes('<div id="root"></div>')) {
    throw new Error('dist/index.html has no <div id="root"></div> to render into.')
  }

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

  const routes = await plan()
  let written = 0
  let empty = 0

  for (const route of routes) {
    const payload = await prime(route.reads)

    let rendered
    try {
      rendered = render(route.url)
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

    const html = template
      .replace('</head>', `  ${rendered.head}\n    ${seedScript(payload)}\n  </head>`)
      .replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>`)

    const file = route.url === '/' ? 'index.html' : `${route.url.replace(/^\//, '')}.html`
    await fs.mkdir(path.join(DIST, path.dirname(file)), { recursive: true })
    await fs.writeFile(path.join(DIST, file), html)
    written += 1
  }

  await fs.rm(SSR_OUT, { recursive: true, force: true })
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
const seedScript = (payload) =>
  `<script>window.__LOOM_CACHE__=${JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')}</script>`

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
