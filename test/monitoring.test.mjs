import { test } from 'node:test'
import assert from 'node:assert/strict'
import './helpers/browser.mjs'

/** Error reports (Sentry envelopes, no SDK) and Core Web Vitals. */
const { envelope, parseDsn } = await import('../src/lib/sentry-envelope.js')
const { rate, watchVitals } = await import('../src/lib/vitals.js')

test('a DSN gives the envelope address; an empty or malformed one gives nothing', () => {
  assert.deepEqual(parseDsn('https://abc123@o42.ingest.sentry.io/7'), {
    key: 'abc123', origin: 'https://o42.ingest.sentry.io', url: 'https://o42.ingest.sentry.io/api/7/envelope/?sentry_key=abc123&sentry_version=7',
  })
  assert.equal(parseDsn(''), null)
  assert.equal(parseDsn('not a dsn'), null)
  assert.equal(parseDsn('https://o42.ingest.sentry.io/7'), null, 'no public key')
})

test('an envelope carries one event with the error, tags and address', () => {
  const error = new TypeError('product.images is undefined')
  const { eventId, body } = envelope(error, 'https://abc@o1.ingest.sentry.io/2', {
    tags: { kind: 'render' }, extra: { errorId: '3f2a9c0d1e4b' }, url: 'https://shop.test/product/x', environment: 'staging',
  }, new Date('2026-09-15T10:00:00Z'))
  const [header, item, event] = body.split('\n').map((line) => JSON.parse(line))
  assert.equal(header.event_id, eventId)
  assert.equal(item.type, 'event')
  assert.match(eventId, /^[0-9a-f]{32}$/)
  assert.deepEqual([event.exception.values[0].type, event.exception.values[0].value], ['TypeError', 'product.images is undefined'])
  assert.deepEqual([event.tags.kind, event.extra.errorId, event.request.url, event.environment], ['render', '3f2a9c0d1e4b', 'https://shop.test/product/x', 'staging'])
})

test('web vitals are rated with the published thresholds and reported once when the page is hidden', () => {
  assert.equal(rate('LCP', 2400), 'good')
  assert.equal(rate('LCP', 3000), 'needs-improvement')
  assert.equal(rate('CLS', 0.3), 'poor')
  assert.equal(rate('INP', 150), 'good')

  const observers = {}
  class FakeObserver {
    constructor(callback) { this.callback = callback }
    observe({ type }) { observers[type] = this.callback }
  }
  const listeners = {}
  const win = {
    PerformanceObserver: FakeObserver,
    performance: { getEntriesByType: () => [{ responseStart: 312.4 }] },
    addEventListener: (type, fn) => { listeners[type] = fn },
  }
  const reported = []
  watchVitals((metric) => reported.push(metric), { win, doc: { addEventListener() {} } })
  const feed = (type, entries) => observers[type]({ getEntries: () => entries })
  feed('largest-contentful-paint', [{ startTime: 1800.6 }, { startTime: 2600.2 }])
  feed('layout-shift', [{ value: 0.05, hadRecentInput: false }, { value: 0.4, hadRecentInput: true }, { value: 0.02, hadRecentInput: false }])
  feed('event', [{ interactionId: 1, duration: 120 }, { interactionId: 2, duration: 260 }, { interactionId: 0, duration: 900 }])
  listeners.pagehide()
  listeners.pagehide()
  const byName = Object.fromEntries(reported.map((metric) => [metric.name, metric]))
  assert.equal(reported.length, 4, 'reported once, even when the page is hidden twice')
  assert.deepEqual(byName, {
    TTFB: { name: 'TTFB', value: 312, rating: 'good' },
    LCP: { name: 'LCP', value: 2600, rating: 'needs-improvement' },
    CLS: { name: 'CLS', value: 0.07, rating: 'good' },
    INP: { name: 'INP', value: 260, rating: 'needs-improvement' },
  })
})
