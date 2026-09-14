/**
 * Cloudflare Pages: every request comes here first. Files (anything with an extension, except robots.txt and the
 * sitemaps) go on to the static assets; pages are rendered, and kept in Cloudflare's cache for LOOM_CDN_SECONDS.
 * Needs the `nodejs_compat` compatibility flag. Variables: SITE_URL, LOOM_CDN_SECONDS (docs/DEPLOY.md).
 */
import { createHandler, PASS_THROUGH } from '../server/handler.mjs'

let handle = null

export async function onRequest({ request, env = {}, next, waitUntil }) {
  const url = new URL(request.url)
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !PASS_THROUGH.test(url.pathname)) return next()

  handle ||= createHandler({
    loadBundle: () => import('../server-build/entry-server.js'),
    template: () => import('../server-build/template.js').then((m) => m.default),
    env,
  })

  // Pages Functions are not cached by the CDN on their own; the Cache API keeps rendered pages for the same time.
  const cache = request.method === 'GET' && typeof caches !== 'undefined' ? caches.default : null
  const hit = cache && (await cache.match(request))
  if (hit) return hit

  const response = await handle(request)
  const cdn = response.headers.get('cdn-cache-control')
  if (cache && cdn && response.status < 400) {
    const age = Number(/max-age=(\d+)/.exec(cdn)?.[1] || 0)
    if (age > 0) {
      const copy = new Response(response.clone().body, response)
      copy.headers.set('cache-control', `public, s-maxage=${age}`)
      waitUntil?.(cache.put(request, copy))
    }
  }
  return response
}
