/**
 * Request de-duplication and stale-while-revalidate.
 *
 * Three problems this solves, in order of how much they hurt:
 *
 * 1. **Duplicate in-flight requests.** A home page with two product rails and a
 *    header that both want the category tree fires the same GET three times.
 *    Under load that is three times the database work for one page view. Any
 *    call already in flight for the same key is joined, not repeated.
 *
 * 2. **Refetching on every navigation.** Going shop → product → back re-fetches
 *    a catalogue that has not changed. Cached responses are served instantly
 *    from memory and revalidated in the background, so the second visit paints
 *    immediately and still self-corrects.
 *
 * 3. **A cold tab paying full price.** Entries persist in sessionStorage, so a
 *    reload or a restored tab starts warm.
 *
 * Writes are never cached, and any write purges the read namespaces it could
 * have invalidated — a cart mutation must not be served a stale cart.
 */

const inflight = new Map()
const memory = new Map()
const STORE_KEY = 'loom.cache'

/**
 * Listeners woken when a background revalidation actually changed something.
 *
 * Stale-while-revalidate without this is a quiet correctness bug rather than an
 * optimisation: the caller is handed the stale copy, the refresh lands in the
 * cache a moment later, and the screen keeps showing the old data until
 * something else happens to remount it. That is exactly how a product edited in
 * the admin panel — or a demo store migrated to a newer shape on load — reads
 * correctly in one place and wrongly in another.
 *
 * Only fired when the refreshed value differs, so an unchanged response costs a
 * comparison and nothing else.
 */
const watchers = new Set()

export function onRevalidated(fn) {
  watchers.add(fn)
  return () => watchers.delete(fn)
}

function announce(key) {
  for (const fn of watchers) {
    try {
      fn(key)
    } catch {
      /* one bad listener must not stop the others */
    }
  }
}

/** How long a response stays fresh, by namespace. Milliseconds. */
export const TTL = {
  bootstrap: 5 * 60_000,
  storefront: 10 * 60_000,
  catalog: 5 * 60_000,
  product: 5 * 60_000,
  reviews: 10 * 60_000,
  // Cart, orders and account are per-user and change on every action. Caching
  // them is how a shopper ends up looking at someone else's bag on a CDN.
  none: 0,
}

let persisted = null
function loadPersisted() {
  if (persisted) return persisted
  try {
    persisted = JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}')
  } catch {
    persisted = {}
  }
  return persisted
}

function savePersisted() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(persisted))
  } catch {
    // Quota. Drop the persistent tier and keep running from memory.
    persisted = {}
  }
}

function readEntry(key) {
  if (memory.has(key)) return memory.get(key)
  const stored = loadPersisted()[key]
  if (stored) memory.set(key, stored)
  return stored
}

function writeEntry(key, value, ttl) {
  const entry = { value, at: Date.now(), ttl }
  memory.set(key, entry)
  loadPersisted()[key] = entry
  savePersisted()
}

/**
 * Run `fn` behind the cache.
 *
 * Returns cached data immediately when fresh. When stale but present, returns
 * it and revalidates in the background — the screen never blanks for data it
 * already had. Only a cold miss awaits the network.
 */
export async function cached(key, fn, ttl = TTL.catalog) {
  if (!ttl) return dedupe(key, fn)

  const entry = readEntry(key)
  const age = entry ? Date.now() - entry.at : Infinity

  if (entry && age < entry.ttl) return entry.value

  if (entry) {
    // Stale: hand back what we have, refresh behind it, and say so if the
    // refresh disagreed with what we just served.
    const served = JSON.stringify(entry.value)
    dedupe(key, fn)
      .then((fresh) => {
        writeEntry(key, fresh, ttl)
        if (JSON.stringify(fresh) !== served) announce(key)
      })
      .catch(() => {
        /* keep serving the stale copy — a failed refresh is not a broken page */
      })
    return entry.value
  }

  const fresh = await dedupe(key, fn)
  writeEntry(key, fresh, ttl)
  return fresh
}

/** Join an identical request already in flight instead of issuing a second one. */
export function dedupe(key, fn) {
  const existing = inflight.get(key)
  if (existing) return existing
  const p = Promise.resolve()
    .then(fn)
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Drop everything under a namespace, e.g. `invalidate('catalog')`. */
export function invalidate(prefix) {
  for (const key of [...memory.keys()]) {
    if (!prefix || key.startsWith(prefix)) memory.delete(key)
  }
  const store = loadPersisted()
  for (const key of Object.keys(store)) {
    if (!prefix || key.startsWith(prefix)) delete store[key]
  }
  savePersisted()
}

/**
 * Drop cached reads and wake every listener.
 *
 * For a change this tab did not make. A local write knows exactly which read
 * namespaces it invalidated and purges those; a write from another tab arrives
 * as an opaque blob, so the honest response is to assume everything catalogue-
 * shaped is stale and let the mounted pages re-read.
 *
 * The wake matters as much as the purge: emptying the cache only helps the
 * *next* call, and a shop page sitting open makes no next call.
 */
export function invalidateAndNotify(prefix) {
  invalidate(prefix)
  announce(prefix || '*')
}

export function clearAll() {
  memory.clear()
  inflight.clear()
  persisted = {}
  savePersisted()
}

/** Stable cache key — object key order must not produce a second entry. */
export function keyOf(name, args) {
  return `${name}:${stable(args)}`
}

function stable(v) {
  if (v === undefined) return ''
  if (v === null || typeof v !== 'object') return String(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v)
    .sort()
    .filter((k) => v[k] !== undefined)
    .map((k) => `${k}:${stable(v[k])}`)
    .join(',')}}`
}

export function stats() {
  return { memory: memory.size, inflight: inflight.size, persisted: Object.keys(loadPersisted()).length }
}
