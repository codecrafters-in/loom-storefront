import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import { useToast } from './ToastContext.jsx'
import { onExternalWrite, STORAGE_KEYS } from '../lib/crossTab.js'
import { track } from '../lib/analytics.js'
import { t } from '../i18n/index.js'

/**
 * Saved items.
 *
 * Only the slugs live here — the full products are fetched by the wishlist page
 * when it needs them. Keeping a heart button cheap matters because there is one
 * on every card in the grid.
 */
const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const [slugs, setSlugs] = useState([])
  const { push } = useToast()

  // Also after signing in, when what a guest saved has joined the account's list.
  const reload = useCallback(
    () =>
      api
        .getWishlist()
        .then((r) => setSlugs(r.items.map((p) => p.slug)))
        .catch(() => {
          /* nothing to show — an empty list is the right answer */
        }),
    [],
  )
  useEffect(() => {
    reload()
  }, [reload])

  // A heart filled in another tab is filled here too.
  useEffect(() => onExternalWrite(STORAGE_KEYS.wishlist, reload), [reload])

  const toggle = useCallback(
    async (slug, title = t('Item')) => {
      const saved = slugs.includes(slug)
      setSlugs((s) => (saved ? s.filter((x) => x !== slug) : [slug, ...s])) // optimistic
      try {
        if (saved) await api.removeFromWishlist(slug)
        else await api.addToWishlist(slug)
        // Only the saving direction is an event. GA4 has no counterpart for
        // un-saving, and inventing one gives an analyst a metric nothing else
        // in their reports can be compared against.
        if (!saved) track('add_to_wishlist', { items: [{ item_id: slug, item_name: title }] })
        push(saved ? t('{title} removed from saved', { title }) : t('{title} saved', { title }))
      } catch (err) {
        setSlugs((s) => (saved ? [slug, ...s] : s.filter((x) => x !== slug))) // roll back
        push(err.message || t('Could not update your saved items.'), { tone: 'error' })
      }
    },
    [slugs, push],
  )

  const value = useMemo(
    () => ({ slugs, count: slugs.length, has: (slug) => slugs.includes(slug), toggle, reload }),
    [slugs, toggle, reload],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>.')
  return ctx
}
