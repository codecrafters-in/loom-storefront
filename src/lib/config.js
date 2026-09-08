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
    token: env.VITE_API_TOKEN || '',
    timeout: num(env.VITE_API_TIMEOUT, 12000),
  },

  store: {
    name: env.VITE_STORE_NAME || 'LOOM',
    currency: env.VITE_CURRENCY || 'USD',
    locale: env.VITE_LOCALE || 'en-US',
    /** In major units, the way a merchandiser would write it. */
    freeShippingOver: num(env.VITE_FREE_SHIPPING_OVER, 150),
  },

  repoUrl: env.VITE_REPO_URL || 'https://github.com/codecrafters-in/loom-storefront',

  /** Mock mode fakes network latency so loading states are real, not theoretical. */
  mockLatency: num(env.VITE_MOCK_LATENCY, 220),
}

export const isMock = config.dataSource === 'mock'

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
