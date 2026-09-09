/**
 * A browser, as far as this theme is concerned.
 *
 * Everything under `src/lib` assumes `localStorage`, `sessionStorage` and a
 * `window` that dispatches `storage` events. None of that exists in Node, and
 * none of it is worth a jsdom dependency: the theme ships three runtime
 * dependencies on purpose, and a test suite that quadruples the install to
 * check arithmetic has failed a different test.
 *
 * Import this **before** any app module. ES imports are hoisted, so app modules
 * must be pulled in with `await import()` after this file has run — `loadApp()`
 * below does that.
 *
 * The two storage maps model the real thing exactly: `localStorage` is shared
 * between tabs, `sessionStorage` is not. That distinction is the whole reason
 * the cross-tab tests can exist in a single process.
 */
export const shared = new Map() // localStorage — shared across tabs
export const own = new Map() // sessionStorage — this tab only

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

const listeners = new Map()

globalThis.localStorage = store(shared)
globalThis.sessionStorage = store(own)
globalThis.window = {
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  location: { search: '', href: 'http://localhost/' },
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(fn)
  },
  removeEventListener(type, fn) {
    const list = listeners.get(type) || []
    const i = list.indexOf(fn)
    if (i >= 0) list.splice(i, 1)
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
}
globalThis.document = { addEventListener() {}, removeEventListener() {}, body: { style: {} } }

/**
 * Deliver a `storage` event, the way a browser delivers another tab's write.
 *
 * Note that it fires only in the *other* tabs and never in the one that wrote —
 * which is why a test plays the receiving tab and mutates `shared` directly to
 * stand in for the tab that did.
 */
export function fireStorage(key, newValue = shared.get(key) ?? null) {
  for (const fn of (listeners.get('storage') || []).slice()) fn({ key, newValue })
}

/** What another tab did: write to shared storage, then let the browser tell us. */
export async function otherTabWrites(key, mutate) {
  const current = JSON.parse(shared.get(key) ?? 'null')
  shared.set(key, JSON.stringify(mutate(current)))
  fireStorage(key)
  await settle()
}

/**
 * Long enough for the mock adapter's simulated latency.
 *
 * `config.mockLatency` defaults to 220ms and every endpoint waits it out, on
 * purpose — without it no loading state is ever exercised. A test that waits
 * 30ms fails for that reason alone, which happened, and the tempting fix was to
 * change the code rather than the wait.
 */
export const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms))

/** Load the app after the browser exists. Returns the pieces tests need. */
export async function loadApp() {
  const root = new URL('../../src/', import.meta.url).pathname
  const db = await import(`${root}lib/db.js`)
  await db.ready()
  const api = (await import(`${root}lib/api/index.js`)).default
  const cache = await import(`${root}lib/api/cache.js`)
  return { db, api, cache, root }
}

/** A clean catalogue and an empty cache, between tests that need one. */
export async function reset({ db, cache }) {
  await db.resetToSeed()
  cache.clearAll()
  own.clear()
  for (const key of [...shared.keys()]) if (key !== 'loom.db') shared.delete(key)
}

export const money = (m) => (m ? `${(m.amount / 100).toFixed(2)} ${m.currency}` : '—')
