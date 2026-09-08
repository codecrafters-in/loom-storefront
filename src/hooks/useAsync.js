import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run an async read and expose { data, error, loading, reload }.
 *
 * The generation counter is the important part: filters change fast, requests
 * come back out of order, and without it a slow response for "Shirts" can land
 * after a fast one for "Knitwear" and overwrite the screen with stale results.
 */
export default function useAsync(fn, deps = [], { skip = false, initial = null } = {}) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const gen = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const load = useCallback(async () => {
    const mine = (gen.current += 1)
    setLoading(true)
    setError(null)
    try {
      const result = await run()
      if (mine === gen.current) setData(result)
    } catch (err) {
      if (mine === gen.current) setError(err)
    } finally {
      if (mine === gen.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    if (skip) {
      setLoading(false)
      return
    }
    load()
  }, [load, skip])

  return { data, error, loading, reload: load }
}
