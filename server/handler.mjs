/**
 * The storefront rendered for each request: real HTML and real status codes, on any host.
 *
 * A product added in Odoo a minute ago has no prerendered file, so a crawler asking for it used to get the home page's
 * HTML with a 200: invisible to search, and wrong to every link preview. This handler renders the address when it is
 * asked for, with the data the page reads already in it (so the browser adopts the markup instead of painting it
 * again), and answers what an address really is:
 *
 *   200  a page, with its title, description, canonical, Open Graph tags and structured data in the HTML
 *   301  an old address, from the store's redirect table in Odoo (`GET /redirects`)
 *   404  an address that is nothing, rendered as the not-found page
 *   503  a store in maintenance (Retry-After), or Odoo not answering
 *
 * Pages that are different for every visitor (bag, checkout, account, admin) are the app's shell, never cached.
 * robots.txt and the sitemaps are Odoo's, passed through on the storefront's domain.
 *
 * Built on the Fetch API's `Request` and `Response` only, so the same code runs in Node, Vercel, Netlify and
 * Cloudflare; the files in `api/`, `netlify/` and `functions/` only connect it to their host.
 */
import { buildPolicy, inlineScriptHashes } from '../scripts/lib/csp.mjs'
import { etagFetch } from './etag-fetch.mjs'
import { clearStorage, installBrowserGlobals, setLocation } from './globals.mjs'
import { envelope, parseDsn } from '../src/lib/sentry-envelope.js'

/** `/__loom/revalidate` accepts a signature at most this old, so a captured request cannot be replayed later. */
const SIGNATURE_TOLERANCE_SECONDS = 300
const PURGE_EVENTS = ['content.changed', 'product.changed']

const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * Whether `header` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, as Odoo's webhooks sign) signs `body`
 * with `secret`, and recently. Compared in constant time.
 */
export async function verifySignature(secret, header, body, now = Date.now()) {
  const parts = Object.fromEntries(String(header || '').split(',').map((part) => part.trim().split('=')))
  const timestamp = Number(parts.t)
  if (!secret || !parts.v1 || !Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false
  }
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${parts.t}.${body}`)))
  if (expected.length !== parts.v1.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i)
  return diff === 0
}

/** Odoo's robots.txt and sitemaps, answered on the storefront's own domain. */
export const PASS_THROUGH = /^\/(?:robots\.txt|sitemap\.xml|sitemaps\/[a-z]+-\d+\.xml)$/

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
}

// The template's own title and card: a browser keeps the first title it meets, so they must go before the page's.
const TEMPLATE_HEAD = [
  /^\s*<title>[\s\S]*?<\/title>\n?/m,
  /^\s*<meta (?:name|property)="(?:description|og:title|og:description|og:image|og:type|og:site_name|og:url|twitter:card|twitter:title|twitter:description|twitter:image|robots)"[^>]*>\n?/gm,
]

const STATUS = { page: 200, 'not-found': 404, maintenance: 503, error: 503 }

const seconds = (value, fallback) => {
  const n = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

const originOf = (base) => {
  try {
    return new URL(base).origin
  } catch {
    return ''
  }
}

/**
 * `</script>` inside a product description would close this tag early and hand the rest of the data to the HTML
 * parser. Merchants write descriptions.
 */
export const seedScript = (name, payload) =>
  `<script>window.${name}=${JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')}</script>`

/** The page: the template with the route's head, the data it was rendered from, and its markup. */
export function assemble(template, { html = '', head = '', seeds = {}, language = '', direction = 'ltr' } = {}) {
  let out = template
  if (head.includes('<title>')) for (const pattern of TEMPLATE_HEAD) out = out.replace(pattern, '')
  if (language) out = out.replace(/<html\b[^>]*>/i, `<html lang="${language.replace(/[^\w-]/g, '')}" dir="${direction === 'rtl' ? 'rtl' : 'ltr'}">`)
  const scripts = Object.entries(seeds)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([name, value]) => seedScript(name, value))
  const extra = [head, ...scripts].filter(Boolean).join('\n    ')
  if (extra) out = out.replace('</head>', `  ${extra}\n  </head>`)
  return html ? out.replace('<div id="root"></div>', `<div id="root">${html}</div>`) : out
}

/**
 * Caching. Browsers always ask again (`max-age=0`), so a shopper never sees yesterday's price after a reload; the CDN
 * in front keeps a page for `LOOM_CDN_SECONDS` and serves the old copy for up to `LOOM_STALE_SECONDS` while it
 * renders a fresh one behind it. `CDN-Cache-Control` is read by Vercel, Netlify and Cloudflare and ignored by browsers.
 */
export function cacheHeaders(kind, { cdnSeconds = 120, staleSeconds = 86400 } = {}) {
  if (kind === 'page') {
    return {
      'cache-control': 'public, max-age=0, must-revalidate',
      'cdn-cache-control': `public, max-age=${cdnSeconds}, stale-while-revalidate=${staleSeconds}`,
    }
  }
  if (kind === 'not-found') return { 'cache-control': 'public, max-age=0, must-revalidate', 'cdn-cache-control': 'public, max-age=60' }
  if (kind === 'redirect') return { 'cache-control': 'public, max-age=300', 'cdn-cache-control': 'public, max-age=3600' }
  return { 'cache-control': 'private, no-store' }
}

/**
 * @param {object} options
 * @param {() => Promise<object>} options.loadBundle  imports the server bundle (`server-build/entry-server.js`)
 * @param {string | (() => Promise<string>)} options.template  the built `index.html`, before any page is put in it
 * @param {object} [options.env]  `SITE_URL`, `LOOM_CDN_SECONDS`, `LOOM_STALE_SECONDS`, `LOOM_API_ETAGS`
 * @param {typeof fetch} [options.fetch]  for robots.txt, sitemaps and redirects (tests pass their own)
 */
export function createHandler({ loadBundle, template, env = {}, fetch: fetchImpl } = {}) {
  const settings = {
    cdnSeconds: seconds(env.LOOM_CDN_SECONDS, 120),
    staleSeconds: seconds(env.LOOM_STALE_SECONDS, 86400),
    siteUrl: String(env.SITE_URL || '').trim().replace(/\/+$/, ''),
  }
  const upstream = (...args) => (fetchImpl || globalThis.fetch)(...args)
  let loading = null
  let queue = Promise.resolve()

  const load = () =>
    (loading ||= (async () => {
      installBrowserGlobals(settings.siteUrl || 'http://localhost')
      if (String(env.LOOM_API_ETAGS || 'on').toLowerCase() !== 'off' && !globalThis.fetch.etagCache) {
        globalThis.fetch = etagFetch(globalThis.fetch)
      }
      const [bundle, html] = await Promise.all([loadBundle(), typeof template === 'function' ? template() : template])
      return { bundle, template: html }
    })().catch((err) => {
      loading = null
      throw err
    }))

  /**
   * One render at a time per instance. The theme keeps its API cache, language and location in module state, as a
   * browser tab does, so two renders interleaving their awaits would mix one shopper's language into another's page.
   * A render takes milliseconds once Odoo has answered, and the CDN absorbs repeats.
   */
  const exclusive = (task) => {
    const run = queue.then(task, task)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function passThrough(request, apiBase, pathname) {
    const response = await upstream(new URL(apiBase + pathname, request.url).toString(), { headers: { accept: '*/*' } })
    const body = await response.text()
    return new Response(request.method === 'HEAD' ? null : body, {
      status: response.status,
      headers: {
        ...SECURITY_HEADERS,
        'content-type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
        'cache-control': response.ok ? 'public, max-age=3600' : 'no-store',
      },
    })
  }

  async function movedTo(apiBase, path, requestUrl) {
    try {
      const response = await upstream(new URL(`${apiBase}/redirects?path=${encodeURIComponent(path)}`, requestUrl).toString(), {
        headers: { accept: 'application/json' },
      })
      if (!response.ok) return null
      const { to, code } = await response.json()
      return typeof to === 'string' && to ? { to, code: code === 302 ? 302 : 301 } : null
    } catch {
      return null
    }
  }

  /** A render that failed, to Sentry when `SENTRY_DSN` is set. Never awaited long: the shopper's answer comes first. */
  function reportFailure(err, url) {
    const target = parseDsn(env.SENTRY_DSN)
    if (!target) return
    const { body } = envelope(err, env.SENTRY_DSN, { platform: 'node', environment: env.SENTRY_ENVIRONMENT || 'production', url: String(url), tags: { kind: 'render' } })
    Promise.resolve(upstream(target.url, { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8' } })).catch(() => {})
  }

  /**
   * `POST /__loom/revalidate`: Odoo's `content.changed` and `product.changed` webhooks ("Connect cache purge" on the
   * store in Odoo), signed with LOOM_WEBHOOK_SECRET. Clears this instance's API cache; with CLOUDFLARE_ZONE_ID and
   * CLOUDFLARE_API_TOKEN it purges the addresses from Cloudflare, and LOOM_PURGE_URL receives the same signed request
   * for any other CDN. Without a CDN purge, pages refresh within LOOM_CDN_SECONDS. A failed purge answers 502, so Odoo
   * tries again.
   */
  async function revalidate(request) {
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    if (!env.LOOM_WEBHOOK_SECRET) return json(404, { code: 'not_configured', message: 'Set LOOM_WEBHOOK_SECRET to accept cache purges.' })
    const body = await request.text()
    const signature = request.headers.get('x-loom-signature')
    if (!(await verifySignature(env.LOOM_WEBHOOK_SECRET, signature, body))) return json(401, { code: 'invalid_signature' })
    let message
    try {
      message = JSON.parse(body)
    } catch {
      return json(400, { code: 'bad_json' })
    }
    if (!PURGE_EVENTS.includes(message?.event)) return json(200, { ok: true, event: message?.event || null, purged: 0 })

    const data = message.data || {}
    const paths = (message.event === 'product.changed' ? [data.slug && `/product/${data.slug}`, '/shop'] : data.paths || [])
      .filter((path) => typeof path === 'string' && path.startsWith('/'))
    const all = message.event === 'content.changed' && data.all === true
    try {
      const { bundle } = await load()
      bundle.purge?.()
    } catch {
      // Not loaded yet: nothing is cached.
    }
    globalThis.fetch.etagCache?.clear?.()
    try {
      const cdn = await purgeCdn(paths, all, body, signature)
      return json(200, { ok: true, event: message.event, purged: all ? 'all' : paths.length, cdn })
    } catch (err) {
      return json(502, { code: 'purge_failed', message: String(err?.message || err).slice(0, 200) })
    }
  }

  async function purgeCdn(paths, all, body, signature) {
    if (env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_API_TOKEN) {
      const send = async (payload) => {
        const response = await upstream(`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
          method: 'POST',
          headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!response.ok) throw new Error(`Cloudflare answered ${response.status}`)
      }
      // Cloudflare purges at most 30 addresses a call; a sitewide change, or no SITE_URL to build them from, purges all.
      if (all || !settings.siteUrl) await send({ purge_everything: true })
      else for (let i = 0; i < paths.length; i += 30) await send({ files: paths.slice(i, i + 30).map((path) => settings.siteUrl + path) })
      return 'cloudflare'
    }
    if (env.LOOM_PURGE_URL) {
      const response = await upstream(env.LOOM_PURGE_URL, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-loom-signature': signature }, body,
      })
      if (!response.ok) throw new Error(`${env.LOOM_PURGE_URL} answered ${response.status}`)
      return 'forwarded'
    }
    return 'none'
  }

  /** `/__loom/health`: the handler runs, its bundle loads, and the store's API answers (and how fast). */
  async function health(head) {
    const started = Date.now()
    let api = { ok: false }
    try {
      const { bundle } = await load()
      if (!bundle.apiBaseUrl) api = { ok: true, demo: true }
      else {
        const response = await upstream(`${bundle.apiBaseUrl}/health`, { headers: { accept: 'application/json' } })
        api = { ok: response.ok, status: response.status, ms: Date.now() - started }
      }
    } catch (err) {
      api = { ok: false, error: String(err?.message || err).slice(0, 200) }
    }
    const body = JSON.stringify({ status: api.ok ? 'ok' : 'degraded', api })
    return new Response(head ? null : body, { status: api.ok ? 200 : 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  }

  return async function handle(request) {
    const url = new URL(request.url)
    if (url.pathname === '/__loom/health') return health(request.method === 'HEAD')
    if (url.pathname === '/__loom/revalidate') {
      return request.method === 'POST'
        ? revalidate(request)
        : new Response('Method not allowed', { status: 405, headers: { ...SECURITY_HEADERS, allow: 'POST' } })
    }
    const head = request.method === 'HEAD'
    if (request.method !== 'GET' && !head) {
      return new Response('Method not allowed', { status: 405, headers: { ...SECURITY_HEADERS, allow: 'GET, HEAD' } })
    }
    const { bundle, template: shell } = await load()
    const apiBase = bundle.apiBaseUrl || ''
    const answer = (status, body, headers) =>
      new Response(head ? null : body, { status, headers: { ...SECURITY_HEADERS, ...headers } })

    if (PASS_THROUGH.test(url.pathname)) {
      // The demo build writes its own files; a live store's come from Odoo.
      return apiBase ? passThrough(request, apiBase, url.pathname) : answer(404, 'Not found', { 'content-type': 'text/plain' })
    }

    const origin = settings.siteUrl || url.origin
    let result
    try {
      result = await exclusive(async () => {
        clearStorage()
        setLocation(`${origin}${url.pathname}${url.search}`)
        return bundle.page(`${url.pathname}${url.search}`)
      })
    } catch (err) {
      console.error(`[render] ${url.pathname}${url.search} failed: ${err?.message || err}`)
      reportFailure(err, url)
      result = { kind: 'error' }
    }

    if (result.kind === 'not-found' && apiBase && result.path) {
      const moved = await movedTo(apiBase, result.path, request.url)
      if (moved) {
        const location = /^https?:\/\//i.test(moved.to) ? moved.to : `${result.prefix ? `/${result.prefix}` : ''}${moved.to}`
        return answer(moved.code, '', { location, ...cacheHeaders('redirect', settings) })
      }
    }

    const rendered = result.kind === 'page' || result.kind === 'not-found'
    const body = assemble(shell, {
      html: rendered ? result.html : '',
      head: rendered ? result.head : '',
      seeds: rendered ? { __LOOM_CACHE__: result.payload, __LOOM_LANG__: result.seedLanguage } : {},
      language: result.language,
      direction: result.direction,
    })
    const status = STATUS[result.kind] ?? 200
    const headers = {
      'content-type': 'text/html; charset=utf-8',
      // A header rather than the build's meta tag: the hash of this response's data script changes with every page.
      'content-security-policy': `${buildPolicy({ hashes: inlineScriptHashes(body), apiOrigin: originOf(apiBase), connect: [originOf(bundle.sentryDsn || '')].filter(Boolean) })}; frame-ancestors 'none'`,
      ...cacheHeaders(result.kind, settings),
    }
    if (result.kind !== 'page') headers['x-robots-tag'] = 'noindex'
    if (status === 503) headers['retry-after'] = result.kind === 'maintenance' ? '300' : '60'
    return answer(status, body, headers)
  }
}
