import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assemble, cacheHeaders, createHandler } from '../server/handler.mjs'
import { etagFetch } from '../server/etag-fetch.mjs'
import { createNodeServer, findFile } from '../server/node.mjs'
import { onRequest as cloudflare } from '../functions/[[path]].js'

/**
 * The request-time render handler (server/handler.mjs) and the Node server, with a stand-in for the server bundle:
 * what reaches a crawler (status, head, data, headers) is decided here, not in React.
 */
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Store</title>
    <meta name="description" content="" />
    <script type="module" crossorigin src="/assets/index.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`
const API = 'https://odoo.test/loom/api/v1/shop'

const page = (extra = {}) => ({
  kind: 'page', html: '<main>Merino Crew</main>', head: '<title>Merino Crew | Shop</title>',
  payload: { 'getProduct:merino-crew': { title: 'Merino Crew' } }, language: 'en', direction: 'ltr', ...extra,
})

function bundle(routes, apiBaseUrl = API) {
  const calls = []
  return {
    calls,
    apiBaseUrl,
    async page(target) {
      calls.push(target)
      const route = routes[new URL(target, 'http://x').pathname]
      if (route instanceof Error) throw route
      if (typeof route === 'function') return route(target)
      return route || { kind: 'not-found', path: new URL(target, 'http://x').pathname, prefix: '', language: 'en', html: '<main>Not found</main>', head: '<title>Not found</title>', payload: {} }
    },
  }
}

function upstream(routes) {
  const seen = []
  const fn = async (url) => {
    seen.push(String(url))
    const hit = routes[String(url)]
    if (!hit) return new Response('{"code":"not_found"}', { status: 404, headers: { 'content-type': 'application/json' } })
    return new Response(hit.body, { status: hit.status || 200, headers: hit.headers || {} })
  }
  fn.seen = seen
  return fn
}

const handler = (fake, fetch = upstream({}), env = {}) =>
  createHandler({ loadBundle: async () => fake, template: TEMPLATE, fetch, env: { LOOM_API_ETAGS: 'off', ...env } })

const get = (handle, target, init) => handle(new Request(`https://shop.test${target}`, init))

describe('render handler', () => {
  test('a page is rendered with its head, its data and a policy that allows exactly that data', async () => {
    const handle = handler(bundle({ '/product/merino-crew': page({ payload: { note: '</script><script>alert(1)</script>' } }) }))
    const res = await get(handle, '/product/merino-crew')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8')
    const html = await res.text()
    assert.match(html, /<div id="root"><main>Merino Crew<\/main><\/div>/)
    assert.equal(html.match(/<title>/g).length, 1, 'the template title is replaced, not added to')
    assert.doesNotMatch(html, /<meta name="description" content="" \/>/)
    assert.doesNotMatch(html, /<\/script><script>alert/, 'data cannot close its script tag')

    const seed = html.match(/<script>(window\.__LOOM_CACHE__=[\s\S]*?)<\/script>/)[1]
    const hash = `'sha256-${createHash('sha256').update(seed).digest('base64')}'`
    const csp = res.headers.get('content-security-policy')
    assert.ok(csp.includes(hash), 'the data script is allowed by its hash')
    assert.match(csp, /connect-src 'self' https:\/\/odoo\.test/)
    assert.match(csp, /frame-ancestors 'none'$/)
    assert.equal(res.headers.get('cdn-cache-control'), 'public, max-age=120, stale-while-revalidate=86400')
    assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate')
    assert.equal(res.headers.get('x-robots-tag'), null)
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
  })

  test('the language and direction of the page reach the html element, and the default language is seeded', async () => {
    const handle = handler(bundle({ '/': page({ language: 'ar', direction: 'rtl', seedLanguage: 'ar' }) }))
    const html = await (await get(handle, '/')).text()
    assert.match(html, /<html lang="ar" dir="rtl">/)
    assert.match(html, /window\.__LOOM_LANG__="ar"/)
  })

  test('an old address answers 301 to the new one, keeping the language prefix', async () => {
    const fetch = upstream({ [`${API}/redirects?path=%2Fproduct%2Fold-crew`]: { body: '{"to":"/product/merino-crew","code":301}' } })
    const handle = handler(bundle({ '/fr/product/old-crew': { kind: 'not-found', path: '/product/old-crew', prefix: 'fr', language: 'fr', html: 'x', head: '<title>x</title>' } }), fetch)
    const res = await get(handle, '/fr/product/old-crew')
    assert.equal(res.status, 301)
    assert.equal(res.headers.get('location'), '/fr/product/merino-crew')
    assert.equal(res.headers.get('cdn-cache-control'), 'public, max-age=3600')
  })

  test('an unknown address is a 404 page nobody indexes', async () => {
    const res = await get(handler(bundle({})), '/product/nothing-here')
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex')
    assert.equal(res.headers.get('cdn-cache-control'), 'public, max-age=60')
    assert.match(await res.text(), /<main>Not found<\/main>/)
  })

  test('maintenance is a 503 with Retry-After; an Odoo that fails is a 503 too; neither is cached', async () => {
    const fake = bundle({ '/shop': { kind: 'maintenance', language: 'en' }, '/pages/about': new Error('Odoo timed out') })
    const handle = handler(fake)
    const closed = await get(handle, '/shop')
    assert.equal(closed.status, 503)
    assert.equal(closed.headers.get('retry-after'), '300')
    assert.equal(closed.headers.get('cache-control'), 'private, no-store')
    assert.match(await closed.text(), /<div id="root"><\/div>/, 'the app shell, which shows the maintenance screen')

    const original = console.error
    console.error = () => {}
    try {
      const failed = await get(handle, '/pages/about')
      assert.equal(failed.status, 503)
      assert.equal(failed.headers.get('retry-after'), '60')
    } finally {
      console.error = original
    }
  })

  test('pages for one visitor are the shell, never cached or indexed', async () => {
    const res = await get(handler(bundle({ '/checkout': { kind: 'private', language: 'en' } })), '/checkout')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'private, no-store')
    assert.equal(res.headers.get('x-robots-tag'), 'noindex')
    assert.equal(res.headers.get('cdn-cache-control'), null)
  })

  test("robots.txt and sitemaps are Odoo's, on the storefront's domain", async () => {
    const fetch = upstream({
      [`${API}/robots.txt`]: { body: 'User-agent: *\nAllow: /\n', headers: { 'content-type': 'text/plain; charset=utf-8' } },
      [`${API}/sitemap.xml`]: { body: '<sitemapindex/>', headers: { 'content-type': 'application/xml; charset=utf-8' } },
    })
    const fake = bundle({})
    const handle = handler(fake, fetch)
    const robots = await get(handle, '/robots.txt')
    assert.equal(await robots.text(), 'User-agent: *\nAllow: /\n')
    assert.equal(robots.headers.get('cache-control'), 'public, max-age=3600')
    assert.match((await get(handle, '/sitemap.xml')).headers.get('content-type'), /xml/)
    assert.equal((await get(handle, '/sitemaps/products-9.xml')).status, 404)
    assert.deepEqual(fake.calls, [], 'nothing was rendered')
  })

  test('HEAD answers headers only; other methods are refused', async () => {
    const handle = handler(bundle({ '/': page() }))
    const head = await get(handle, '/', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    assert.equal((await get(handle, '/', { method: 'POST', body: '{}' })).status, 405)
  })

  test('renders run one at a time, and each sees its own address', async () => {
    let active = 0
    let most = 0
    const seen = []
    const slow = async (target) => {
      active += 1
      most = Math.max(most, active)
      seen.push(globalThis.window.location.href)
      await new Promise((resolve) => setTimeout(resolve, 15))
      active -= 1
      return page({ html: `<main>${target}</main>` })
    }
    const handle = handler(bundle({ '/a': slow, '/b': slow, '/c': slow }), upstream({}), { SITE_URL: 'https://www.shop.example/' })
    const pages = await Promise.all(['/a', '/b?x=1', '/c'].map((p) => get(handle, p).then((r) => r.text())))
    assert.equal(most, 1)
    assert.deepEqual(seen, ['https://www.shop.example/a', 'https://www.shop.example/b?x=1', 'https://www.shop.example/c'])
    assert.match(pages[1], /<main>\/b\?x=1<\/main>/)
  })

  test('cache lifetimes come from the environment', () => {
    assert.equal(cacheHeaders('page', { cdnSeconds: 30, staleSeconds: 600 })['cdn-cache-control'], 'public, max-age=30, stale-while-revalidate=600')
    assert.equal(assemble(TEMPLATE, {}), TEMPLATE, 'nothing to add leaves the template as it is')
  })
})

describe('render handler health and error reports', () => {
  test('/__loom/health answers whether the store API does, and how fast', async () => {
    const up = handler(bundle({}), upstream({ [`${API}/health`]: { body: '{"status":"ok"}' } }))
    const ok = await get(up, '/__loom/health')
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
    const body = await ok.json()
    assert.equal(body.status, 'ok')
    assert.equal(body.api.status, 200)

    const down = await get(handler(bundle({})), '/__loom/health')
    assert.equal(down.status, 503)
    assert.equal((await down.json()).status, 'degraded')
  })

  test('a render that fails is reported to Sentry when SENTRY_DSN is set, and the policy allows the browser to report', async () => {
    const seen = []
    const fetch = async (url, init) => {
      seen.push({ url: String(url), body: init?.body })
      return new Response('{}')
    }
    const fake = { ...bundle({ '/pages/about': new Error('Odoo timed out') }), sentryDsn: 'https://pub@o9.ingest.sentry.io/5' }
    const handle = handler(fake, fetch, { SENTRY_DSN: 'https://srv@o9.ingest.sentry.io/6' })
    const original = console.error
    console.error = () => {}
    try {
      assert.equal((await get(handle, '/pages/about')).status, 503)
    } finally {
      console.error = original
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    const report = seen.find((call) => call.url.startsWith('https://o9.ingest.sentry.io/api/6/envelope/'))
    assert.ok(report, 'reported')
    assert.match(report.body, /Odoo timed out/)

    const rendered = await get(handler({ ...bundle({ '/': page() }), sentryDsn: 'https://pub@o9.ingest.sentry.io/5' }), '/')
    assert.match(rendered.headers.get('content-security-policy'), /connect-src [^;]*https:\/\/o9\.ingest\.sentry\.io/)
  })
})

describe('ETag memory for API calls', () => {
  test('a second call asks with If-None-Match and a 304 gives back the kept answer', async () => {
    const sent = []
    let calls = 0
    const inner = async (url, init) => {
      sent.push(init.headers.get('if-none-match'))
      calls += 1
      assert.equal(init.cache, undefined, 'request cache modes are not passed to server runtimes')
      return calls === 1
        ? new Response('{"title":"Merino"}', { status: 200, headers: { etag: '"v1"', 'content-type': 'application/json' } })
        : new Response(null, { status: 304 })
    }
    const fetch = etagFetch(inner)
    assert.equal(await (await fetch(`${API}/products/merino`, { cache: 'default' })).text(), '{"title":"Merino"}')
    const again = await fetch(`${API}/products/merino`, { cache: 'default' })
    assert.equal(again.status, 200)
    assert.equal(await again.text(), '{"title":"Merino"}')
    assert.deepEqual(sent, [null, '"v1"'])
    await fetch(`${API}/products/merino`, { headers: { 'x-loom-lang': 'fr' } })
    assert.equal(sent[2], null, 'another language is another answer')
  })
})

describe('Node server', () => {
  const dirs = []
  after(async () => Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true }))))

  async function site({ withBundle = true } = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-node-'))
    dirs.push(root)
    const dist = path.join(root, 'dist')
    const build = path.join(root, 'server-build')
    await fs.mkdir(path.join(dist, 'assets'), { recursive: true })
    await fs.mkdir(path.join(dist, '.vite'), { recursive: true })
    await fs.writeFile(path.join(dist, 'assets', 'index-abc.js'), 'console.log(1)')
    await fs.writeFile(path.join(dist, '.vite', 'manifest.json'), '{"secret":true}')
    await fs.writeFile(path.join(dist, 'index.html'), TEMPLATE)
    if (withBundle) {
      await fs.rm(path.join(dist, 'index.html'))
      await fs.mkdir(build)
      await fs.writeFile(path.join(build, 'template.js'), `export default ${JSON.stringify(TEMPLATE)}`)
      await fs.writeFile(path.join(build, 'entry-server.js'), `export const apiBaseUrl = ''
export async function page(target) {
  return { kind: 'page', html: '<main>' + target + '</main>', head: '<title>Rendered</title>', payload: {}, language: 'en' }
}`)
    }
    const server = await createNodeServer({ dist, build, env: { LOOM_API_ETAGS: 'off' } })
    await new Promise((resolve) => server.listen(0, resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    return { dist, base, close: () => new Promise((resolve) => server.close(resolve)) }
  }

  test('files are served with long caching; pages are rendered; hidden files and parent paths are not served', async () => {
    const { dist, base, close } = await site()
    try {
      const asset = await fetch(`${base}/assets/index-abc.js`)
      assert.equal(asset.status, 200)
      assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
      assert.match(asset.headers.get('content-type'), /javascript/)

      const product = await fetch(`${base}/product/new-arrival`)
      assert.equal(product.status, 200)
      assert.match(await product.text(), /<main>\/product\/new-arrival<\/main>/)

      const hidden = await fetch(`${base}/.vite/manifest.json`)
      assert.doesNotMatch(await hidden.text(), /secret/)
      assert.equal(await findFile(dist, '/../../etc/passwd'), null)
    } finally {
      await close()
    }
  })

  test('without a server bundle (a demo build) it serves dist/ as a single-page app', async () => {
    const original = console.warn
    console.warn = () => {}
    const { base, close } = await site({ withBundle: false }).finally(() => {
      console.warn = original
    })
    try {
      const res = await fetch(`${base}/anything`)
      assert.equal(res.status, 200)
      assert.match(await res.text(), /<div id="root"><\/div>/)
    } finally {
      await close()
    }
  })
})

describe('Cloudflare Pages function', () => {
  test('files go on to the static assets; robots.txt does not', async () => {
    let passed = 0
    const next = async () => {
      passed += 1
      return new Response('asset')
    }
    const res = await cloudflare({ request: new Request('https://shop.test/assets/index-abc.js'), env: {}, next })
    assert.equal(await res.text(), 'asset')
    assert.equal(passed, 1)
  })
})
