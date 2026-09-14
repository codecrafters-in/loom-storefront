/**
 * Core Web Vitals from the browser's own performance entries, reported once per page load when the page is hidden:
 * LCP (largest paint), CLS (layout shift), INP (slowest interaction), FCP and TTFB. No library; the ratings use the
 * thresholds Google publishes. Sent to analytics as `web_vitals` events (src/lib/analytics.js).
 */
const THRESHOLDS = { LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500], FCP: [1800, 3000], TTFB: [800, 1800] }

export function rate(name, value) {
  const [good, poor] = THRESHOLDS[name] || [Infinity, Infinity]
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor'
}

export function watchVitals(report, { win = typeof window !== 'undefined' ? window : undefined, doc = typeof document !== 'undefined' ? document : undefined } = {}) {
  if (!win || typeof win.PerformanceObserver === 'undefined') return () => {}
  const metrics = {}
  const observe = (type, onEntry, options = {}) => {
    try {
      new win.PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true, ...options })
    } catch {
      // This browser does not report that entry type.
    }
  }
  observe('largest-contentful-paint', (entry) => {
    metrics.LCP = entry.startTime
  })
  let shifted = 0
  observe('layout-shift', (entry) => {
    if (!entry.hadRecentInput) metrics.CLS = shifted += entry.value
  })
  observe('event', (entry) => {
    if (entry.interactionId) metrics.INP = Math.max(metrics.INP || 0, entry.duration)
  }, { durationThreshold: 40 })
  observe('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') metrics.FCP = entry.startTime
  })
  const navigation = win.performance?.getEntriesByType?.('navigation')?.[0]
  if (navigation) metrics.TTFB = navigation.responseStart

  let done = false
  const flush = () => {
    if (done) return
    done = true
    for (const [name, value] of Object.entries(metrics)) {
      report({ name, value: name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value), rating: rate(name, value) })
    }
  }
  doc?.addEventListener?.('visibilitychange', () => doc.visibilityState === 'hidden' && flush())
  win.addEventListener('pagehide', flush)
  return flush
}
