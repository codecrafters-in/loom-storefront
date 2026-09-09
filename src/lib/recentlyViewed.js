import { onExternalWrite } from './crossTab.js'

/**
 * What this person has been looking at.
 *
 * Kept in the browser and nowhere else. A recently-viewed rail is one of the
 * few personalisation features that needs no profile, no server and no consent
 * banner — the list never leaves the device, so there is nothing to leak and
 * nothing to ask permission for.
 *
 * **Scoped to whoever is signed in.** A shared laptop is the normal case in a
 * household, and a rail showing the last person's browsing is both a privacy
 * problem and a useless recommendation. Signing out returns you to your own
 * guest list rather than inheriting theirs.
 *
 * When a guest signs in, their guest list is merged into the account's once and
 * then cleared: the shopper who browsed for ten minutes and then logged in to
 * check out should not lose the ten minutes.
 */
const PREFIX = 'loom.recent'
const LIMIT = 12

const keyFor = (customerId) => `${PREFIX}:${customerId || 'guest'}`

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter((entry) => entry?.slug) : []
  } catch {
    // Private mode, a cleared store, or something else's data under our key.
    return []
  }
}

function write(key, entries) {
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(0, LIMIT)))
  } catch {
    /* quota or private mode — the rail is a nicety, not a feature to fail on */
  }
}

/** Most recent first. */
export function recent(customerId) {
  return read(keyFor(customerId))
}

/**
 * Record a view.
 *
 * Stores the slug and the time, not the product. A cached title and price go
 * stale — the rail would show yesterday's price beside today's — so the slugs
 * are looked up fresh and anything that has since been unpublished simply
 * disappears from the rail rather than 404ing from it.
 */
export function remember(slug, customerId) {
  if (!slug) return recent(customerId)
  const key = keyFor(customerId)
  const next = [{ slug, at: Date.now() }, ...read(key).filter((entry) => entry.slug !== slug)]
  write(key, next)
  return next.slice(0, LIMIT)
}

export function forget(customerId) {
  try {
    localStorage.removeItem(keyFor(customerId))
  } catch {
    /* nothing to do */
  }
}

/**
 * Carry a guest's browsing into the account they just signed in to.
 *
 * Runs once per sign-in and clears the guest list afterwards, so the next
 * person to use the browser starts empty.
 */
export function adopt(customerId) {
  if (!customerId) return recent(null)
  const guest = read(keyFor(null))
  if (!guest.length) return recent(customerId)

  const mine = read(keyFor(customerId))
  const seen = new Set(mine.map((entry) => entry.slug))
  const merged = [...mine, ...guest.filter((entry) => !seen.has(entry.slug))].sort((a, b) => b.at - a.at)

  write(keyFor(customerId), merged)
  forget(null)
  return merged.slice(0, LIMIT)
}

/** Another tab browsing is still this person browsing. */
export const onRecentChange = (customerId, fn) => onExternalWrite(keyFor(customerId), fn)
