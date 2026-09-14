/**
 * The products a shopper is comparing, kept in this browser.
 *
 * Slugs only, like recently viewed: a price cached in a comparison table is a
 * price that is wrong by the time somebody reads it, so the page asks for the
 * products afresh.
 *
 * Four at most. A fifth column does not fit a laptop, and a table that scrolls
 * sideways is a table nobody compares across. Adding a fifth drops the oldest
 * rather than refusing — the newest is the one the shopper just asked for.
 *
 * A tiny external store rather than a context, so the tray in the layout and a
 * toggle on the page stay in step without a provider around the whole app.
 */
const KEY = 'loom.compare'
export const COMPARE_LIMIT = 4

const listeners = new Set()
const EMPTY = []
let cache = null

export function compared() {
  if (cache) return cache
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]')
    cache = Array.isArray(stored) ? stored.filter((s) => typeof s === 'string').slice(0, COMPARE_LIMIT) : EMPTY
  } catch {
    cache = EMPTY
  }
  return cache
}

function save(next) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — the comparison lasts for this page */
  }
  listeners.forEach((fn) => fn())
}

export function toggleCompare(slug) {
  const list = compared()
  save(list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug].slice(-COMPARE_LIMIT))
}

export const clearCompare = () => save(EMPTY)

/** For `useSyncExternalStore`. Another tab's change arrives as a storage event. */
export function subscribeCompare(fn) {
  listeners.add(fn)
  const onStorage = (e) => {
    if (e.key !== KEY) return
    cache = null
    fn()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

/** The server render compares nothing, so the first client render matches it. */
export const serverCompared = () => EMPTY
