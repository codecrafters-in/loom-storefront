/**
 * Every knob the theme reads, resolved once.
 *
 * Vite only exposes variables prefixed `VITE_`, and it inlines them at build
 * time — so anything here ends up readable in the shipped bundle. That is fine
 * for a store name or a publishable key and never fine for a secret, which is
 * why the API adapter has no notion of a private credential.
 */
const env = import.meta.env ?? {}

const num = (v, fallback) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  /** 'mock' | 'api' — the one switch that swaps the entire data layer. */
  dataSource: (env.VITE_DATA_SOURCE || 'mock').toLowerCase() === 'api' ? 'api' : 'mock',

  api: {
    baseUrl: (env.VITE_API_BASE_URL || '').replace(/\/+$/, ''),
    timeout: num(env.VITE_API_TIMEOUT, 12000),
    /**
     * 'off' skips the response cache and the browser's HTTP cache, so an edit
     * made in the backend shows on the next page load. For building a shop
     * against a live backend; a real store keeps it on.
     */
    cache: (env.VITE_API_CACHE || 'on').toLowerCase() !== 'off',
  },

  store: {
    name: env.VITE_STORE_NAME || '',
    currency: env.VITE_CURRENCY || 'USD',
    locale: env.VITE_LOCALE || 'en-US',
    /** In major units, the way a merchandiser would write it. */
    freeShippingOver: num(env.VITE_FREE_SHIPPING_OVER, 150),
  },

  // The theme's source, linked from the demo's footer only (see Footer.jsx).
  repoUrl: env.VITE_REPO_URL || '',

  /**
   * Demo admin credential. Mock mode only.
   *
   * These are compiled into the bundle like every VITE_ variable, so they are
   * public by construction. That is acceptable for a demo whose data lives in
   * localStorage and unacceptable for anything else — in api mode the server
   * authenticates and these are ignored.
   */
  adminUser: env.VITE_ADMIN_USER || 'admin',
  adminPassword: env.VITE_ADMIN_PASSWORD || 'admin',

  /** Mock mode fakes network latency so loading states are real, not theoretical. */
  mockLatency: num(env.VITE_MOCK_LATENCY, 220),
}

/**
 * A constant in a Vite build, where vite.config.js writes `__LOOM_API__` in.
 * Every `isMock ? … : …` in the theme then folds away at build time, so the
 * demo's branches do not ship to a live store and the live store's do not ship
 * to the demo. Anywhere else — tests, scripts — it is read from the environment
 * as before.
 */
// eslint-disable-next-line no-undef
export const isMock = typeof __LOOM_API__ === 'boolean' ? !__LOOM_API__ : config.dataSource === 'mock'

/**
 * Fail loudly at boot rather than mysteriously on the first fetch. A missing
 * base URL in api mode is the single most common way to misconfigure this.
 */
export function assertConfig() {
  if (config.dataSource === 'api' && !config.api.baseUrl) {
    throw new Error(
      'VITE_DATA_SOURCE=api but VITE_API_BASE_URL is empty. Set it in .env.local, or switch back to VITE_DATA_SOURCE=mock.',
    )
  }
}

export default config
