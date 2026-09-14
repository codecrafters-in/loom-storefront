/**
 * Everything the suite needs to know about the environment, resolved once.
 *
 * The defaults match `loom_storefront/tools/e2e_seed.py` run on the database
 * `loom_e2e_20260913` with Odoo on port 8074. Override with LOOM_E2E_* variables
 * (see e2e/README.md) — and re-run the seed with matching LOOM_E2E_STOREFRONT_URL
 * values if you move the storefront ports, because CORS is configured from them.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const trim = (url) => String(url).replace(/\/+$/, '')
const env = process.env

const api = trim(env.LOOM_E2E_API || 'http://localhost:8074/loom/api/v1/e2e')
const port = Number(env.LOOM_E2E_PORT || 5174)
const port2 = Number(env.LOOM_E2E_PORT2 || 5175)
/** The storefront served by the render handler (S-12), built by support/render-server.mjs. */
const renderPort = Number(env.LOOM_E2E_RENDER_PORT || 5176)
const storefrontUrl = trim(env.LOOM_E2E_STOREFRONT_URL || `http://localhost:${port}`)

export const settings = {
  /** Store `e2e`: USD, free sign-up. */
  api,
  /** Store `e2e-kw`: a second website on the same Odoo (KWD, Arabic). */
  api2: trim(env.LOOM_E2E_API2 || api.replace(/\/[^/]+$/, '/e2e-kw')),
  odooUrl: trim(env.LOOM_E2E_ODOO_URL || new URL(api).origin),
  db: env.LOOM_E2E_DB || 'loom_e2e_20260913',
  admin: {
    login: env.LOOM_E2E_ADMIN_LOGIN || 'admin',
    password: env.LOOM_E2E_ADMIN_PASSWORD || 'admin',
  },

  port,
  port2,
  storefrontUrl,
  storefront2Url: trim(env.LOOM_E2E_STOREFRONT2_URL || `http://localhost:${port2}`),
  renderPort,
  /** Where S-12 fetches raw HTML from: the render handler's server, or a deployment. */
  crawlUrl: trim(env.LOOM_E2E_CRAWL_URL || `http://localhost:${renderPort}`),
  /** Set to 1 to use storefronts you started yourself (or a deployment) instead of Vite dev servers. */
  skipWebServer: env.LOOM_E2E_SKIP_WEBSERVER === '1',

  customer: {
    email: env.LOOM_E2E_CUSTOMER_EMAIL || 'shopper@e2e.example',
    password: env.LOOM_E2E_CUSTOMER_PASSWORD || 'e2e-shopper-pass',
  },
  b2b: {
    email: 'buyer@trade.e2e.example',
    password: 'e2e-trade-pass',
    company: 'E2E Trade Supplies Ltd',
    vat: 'US123456789',
  },
  promoCode: 'E2E10',
  carrierCode: 'standard',

  storefrontRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
}

/** A fresh, unique email per run, so account and guest checks never collide with an earlier run. */
export const uniqueEmail = (prefix) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@e2e.example`
