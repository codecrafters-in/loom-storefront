/**
 * An error report in Sentry's envelope format, built without Sentry's SDK: one request per error, a few hundred
 * bytes of code, and nothing at all when no DSN is set. Pure, shared by the browser (src/lib/monitoring.js) and the
 * render handler (server/handler.mjs).
 */

/** `https://<key>@<host>/<project>` → where to send, or null for an empty or malformed DSN. */
export function parseDsn(dsn) {
  try {
    const url = new URL(String(dsn || ''))
    const project = url.pathname.replace(/^\/+|\/+$/g, '')
    if (!url.username || !project || !/^https?:$/.test(url.protocol)) return null
    return { key: url.username, origin: url.origin, url: `${url.origin}/api/${project}/envelope/?sentry_key=${url.username}&sentry_version=7` }
  } catch {
    return null
  }
}

const randomId = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`).replace(/-/g, '').slice(0, 32).padEnd(32, '0')

/** The envelope body for one error. `context`: `{ tags, extra, url, platform, environment, release }`. */
export function envelope(error, dsn, context = {}, now = new Date()) {
  const eventId = randomId()
  const frames = String(error?.stack || '')
    .split('\n')
    .slice(1, 30)
    .map((line) => ({ function: line.trim().slice(0, 200) }))
    .reverse()
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: context.platform || 'javascript',
    level: 'error',
    environment: context.environment || 'production',
    ...(context.release ? { release: context.release } : {}),
    tags: context.tags || {},
    extra: context.extra || {},
    ...(context.url ? { request: { url: context.url } } : {}),
    exception: {
      values: [{
        type: error?.name || 'Error',
        value: String(error?.message || error || 'Unknown error').slice(0, 500),
        ...(frames.length ? { stacktrace: { frames } } : {}),
      }],
    },
  }
  return {
    eventId,
    body: [JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n'),
  }
}
