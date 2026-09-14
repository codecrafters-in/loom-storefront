/**
 * Errors reported to Sentry when the store sets `VITE_SENTRY_DSN`: a page that failed to render, an error nothing
 * caught, and an API answer that failed on the server (with Odoo's error reference, so the two logs meet).
 *
 * Loaded only by a build with a DSN (see main.jsx and ErrorBoundary.jsx), and at most 20 reports per page, so a loop
 * that throws cannot flood the project.
 */
import { config } from './config.js'
import { envelope, parseDsn } from './sentry-envelope.js'

const MAX_REPORTS = 20
let sent = 0

export function reportError(error, { tags = {}, extra = {} } = {}) {
  const target = parseDsn(config.monitoring.sentryDsn)
  if (!target || typeof fetch === 'undefined' || sent >= MAX_REPORTS) return null
  sent += 1
  const { eventId, body } = envelope(error, config.monitoring.sentryDsn, {
    tags: { store: config.api.baseUrl ? new URL(config.api.baseUrl, 'http://x').pathname.split('/').pop() : 'demo', ...tags },
    extra,
    url: typeof window !== 'undefined' ? window.location?.href : undefined,
    environment: config.monitoring.environment,
    release: config.monitoring.release,
  })
  fetch(target.url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => {})
  return eventId
}

/** Errors that reach the window: a failed event handler, a promise nobody awaited. */
export function watchErrors(win = window) {
  win.addEventListener('error', (event) => reportError(event.error || event.message, { tags: { kind: 'uncaught' } }))
  win.addEventListener('unhandledrejection', (event) => reportError(event.reason, { tags: { kind: 'unhandled-rejection' } }))
}
