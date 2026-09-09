import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import { useToast } from './ToastContext.jsx'
import { onExternalWrite, STORAGE_KEYS } from '../lib/crossTab.js'

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

  useEffect(() => {
    let alive = true
    api
      .getWishlist()
      .then((r) => alive && setSlugs(r.items.map((p) => p.slug)))
      .catch(() => {
        /* signed out against a real API — an empty list is the right answer */
      })
    return () => {
      alive = false
    }
  }, [])

  // A heart filled in another tab is filled here too.
  useEffect(
    () =>
      onExternalWrite(STORAGE_KEYS.wishlist, () => {
        api
          .getWishlist()
          .then((r) => setSlugs(r.items.map((p) => p.slug)))
          .catch(() => {})
      }),
    [],
  )

  const toggle = useCallback(
    async (slug, title = 'Item') => {
      const saved = slugs.includes(slug)
      setSlugs((s) => (saved ? s.filter((x) => x !== slug) : [slug, ...s])) // optimistic
      try {
        if (saved) await api.removeFromWishlist(slug)
        else await api.addToWishlist(slug)
        push(saved ? `${title} removed from saved` : `${title} saved`)
      } catch (err) {
        setSlugs((s) => (saved ? [slug, ...s] : s.filter((x) => x !== slug))) // roll back
        push(err.message || 'Could not update your saved items.', { tone: 'error' })
      }
    },
    [slugs, push],
  )

  const value = useMemo(
    () => ({ slugs, count: slugs.length, has: (slug) => slugs.includes(slug), toggle }),
    [slugs, toggle],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used inside <WishlistProvider>.')
  return ctx
}
