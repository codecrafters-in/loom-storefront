import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api, { peek } from '../lib/api/index.js'
import { configureAnalytics } from '../lib/analytics.js'
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
  // Whatever the prerenderer already resolved. Every page below reads settings,
  // so without this a server render has no store name, no menu and no currency
  // — and the markup it produces is not the markup the browser will build.
  const seeded = peek.getBootstrap()
  const [remote, setRemote] = useState(seeded?.storefront || null)
  const [boot, setBoot] = useState(seeded || null)
  const [ready, setReady] = useState(Boolean(seeded))
  const [error, setError] = useState(null)

  /**
   * One request for the first screen.
   *
   * `GET /bootstrap` returns settings, categories, collections and the home
   * rails together. Without it the home page is five sequential round trips
   * before anything is readable, and each one on a real backend is its own
   * connection, auth check and query. If the endpoint is missing we fall back
   * to `GET /storefront` and the individual calls, so this is a pure win that
   * a backend can add whenever it likes.
   */
  useEffect(() => {
    let alive = true
    api
      .getBootstrap()
      .then((data) => {
        if (!alive) return
        setBoot(data)
        setRemote(data.storefront || null)
      })
      .catch(() =>
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
          }),
      )
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const cfg = useMemo(() => merge(merge(defaults, fromEnv()), remote), [remote])

  // Settings decide whether anything is sent at all, so this runs before the
  // first event rather than on the first render that happens to need one.
  useEffect(() => {
    configureAnalytics(cfg.analytics || {})
  }, [cfg])

  const value = useMemo(() => {
    return {
      config: cfg,
      ready,
      error,
      usingDefaults: !remote,
      // Prefetched by the bootstrap call. Components read these first and only
      // fall back to their own request when the bootstrap did not include them.
      categories: boot?.categories || null,
      collections: boot?.collections || null,
      rails: boot?.rails || null,
    }
  }, [cfg, remote, boot, ready, error])

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
}

export function useStorefront() {
  const ctx = useContext(StorefrontContext)
  if (!ctx) throw new Error('useStorefront must be used inside <StorefrontProvider>.')
  return ctx.config
}

/** Bootstrap payload — categories, collections and prefetched home rails. */
export function useBootstrap() {
  const ctx = useContext(StorefrontContext)
  return {
    categories: ctx?.categories || null,
    collections: ctx?.collections || null,
    rails: ctx?.rails || null,
  }
}

export function useStorefrontState() {
  const ctx = useContext(StorefrontContext)
  if (!ctx) throw new Error('useStorefrontState must be used inside <StorefrontProvider>.')
  return ctx
}
