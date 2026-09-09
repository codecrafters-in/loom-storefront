import { useCallback, useEffect, useRef, useState } from 'react'
import { onRevalidated } from '../lib/api/cache.js'

/**
 * Run an async read and expose { data, error, loading, reload }.
 *
 * Two things carry their weight here.
 *
 * The generation counter: filters change fast, requests come back out of order,
 * and without it a slow response for "Shirts" can land after a fast one for
 * "Knitwear" and overwrite the screen with stale results.
 *
 * The revalidation subscription: the cache serves stale data instantly and
 * refreshes behind it, which is only correct if the refresh reaches the screen.
 * When one lands with different data we re-read — silently, so a background
 * correction never flashes a skeleton over content the shopper is reading.
 */
export default function useAsync(fn, deps = [], { skip = false, initial = null } = {}) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState(null)
  // Data in hand is not a loading state. This is what lets a prerendered page
  // hydrate into the same markup the server sent instead of flashing a skeleton
  // over it — and it removes the flash on any warm cache hit too.
  const [loading, setLoading] = useState(!skip && initial === null)
  const gen = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const mine = (gen.current += 1)
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const result = await run()
        if (mine === gen.current) setData(result)
      } catch (err) {
        // A silent refresh that fails keeps whatever is on screen. It was good
        // enough a second ago, and an error state over readable content is a
        // worse answer than slightly old content.
        if (mine === gen.current && !silent) setError(err)
      } finally {
        if (mine === gen.current && !silent) setLoading(false)
      }
    },
    [run],
  )

  useEffect(() => {
    if (skip) {
      setLoading(false)
      return undefined
    }
    load()
    // Re-reading goes back through the cache, which is now fresh, so this is a
    // memory hit rather than a second request — and it cannot loop, because a
    // fresh entry never revalidates.
    return onRevalidated(() => load({ silent: true }))
  }, [load, skip])

  return { data, error, loading, reload: load }
}
