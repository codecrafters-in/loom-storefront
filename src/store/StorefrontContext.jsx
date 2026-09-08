import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import { config } from '../lib/config.js'
import { storefront as defaults } from '../data/storefront.js'

/**
 * The theme configuration, resolved once at boot.
 *
 * Three layers, highest priority first:
 *   1. GET /storefront   — the merchant's live settings
 *   2. VITE_* env vars   — deploy-time overrides
 *   3. src/data/storefront.js — the bundled defaults
 *
 * The config fetch is allowed to fail. A store whose settings endpoint is down
 * should still sell things, so a failure falls through to the defaults and
 * records the error rather than blocking the first paint.
 */
const StorefrontContext = createContext(null)

/** Deep merge, arrays replaced wholesale. An admin panel that sends four home
 *  sections means four, not four merged onto the seven that were there. */
function merge(base, patch) {
  if (!patch || typeof patch !== 'object') return base
  if (Array.isArray(patch)) return patch
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base?.[k] ?? {}, v) : v
  }
  return out
}

/** Env wins over the bundled file but loses to the API. */
function fromEnv() {
  const patch = { store: {}, pricing: {}, commerce: {} }
  if (config.store.name) patch.store.name = config.store.name
  if (config.store.currency) patch.pricing.currency = config.store.currency
  if (config.store.locale) patch.pricing.locale = config.store.locale
  if (Number.isFinite(config.store.freeShippingOver)) {
    patch.commerce.freeShippingOver = config.store.freeShippingOver * 100
  }
  return patch
}

export function StorefrontProvider({ children }) {
  const [remote, setRemote] = useState(null)
  const [ready, setReady] = useState(config.dataSource === 'mock')
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    api
      .getStorefront()
      .then((cfg) => alive && setRemote(cfg))
      .catch((err) => {
        if (!alive) return
        setError(err)
        // Loud in development, silent in production — a missing settings
        // endpoint should not be a blank page for a shopper.
        if (import.meta.env.DEV) {
          console.warn('[storefront] falling back to bundled defaults:', err.message)
        }
      })
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const value = useMemo(() => {
    const cfg = merge(merge(defaults, fromEnv()), remote)
    return { config: cfg, ready, error, usingDefaults: !remote }
  }, [remote, ready, error])

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
}

export function useStorefront() {
  const ctx = useContext(StorefrontContext)
  if (!ctx) throw new Error('useStorefront must be used inside <StorefrontProvider>.')
  return ctx.config
}

export function useStorefrontState() {
  const ctx = useContext(StorefrontContext)
  if (!ctx) throw new Error('useStorefrontState must be used inside <StorefrontProvider>.')
  return ctx
}
