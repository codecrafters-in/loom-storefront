/**
 * Wake this tab when another one writes.
 *
 * Everything the demo backend owns lives in localStorage, which is shared
 * between tabs — but only the tab that wrote it knows. The `storage` event is
 * the browser's notification, and it fires *only* in the other tabs, never in
 * the one that made the change, which is exactly the semantics wanted here.
 *
 * Without this, two tabs of the same shop drift apart in ways that look like
 * bugs in whichever tab you happen to be looking at: a bag that says two items
 * in one place and three in another, a heart that is filled on one page and
 * hollow on the next, a sign-out that only takes effect where you clicked it.
 *
 * In `api` mode these keys do not exist, no event ever names them, and every
 * subscription here is inert — cart and session are the server's business then.
 */
export function onExternalWrite(keys, fn) {
  if (typeof window === 'undefined') return () => {}

  const watched = new Set([].concat(keys))
  const handler = (event) => {
    // A null key means the whole store was cleared — treat it as "everything
    // you were watching has changed", because it has.
    if (event.key === null || watched.has(event.key)) fn(event.key)
  }

  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

/** The localStorage keys the demo backend writes, by concern. */
export const STORAGE_KEYS = {
  cart: 'loom.cart',
  wishlist: 'loom.wishlist',
  session: ['loom.session', 'loom.customer'],
}
