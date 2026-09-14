/**
 * Fail in five seconds with a sentence, not in five minutes with sixteen timeouts.
 *
 * The suite needs a seeded Odoo. If it is not there, every scenario would time
 * out on its first page, and the report would read like sixteen storefront bugs.
 */
import { request } from '@playwright/test'
import { settings } from './env.js'

export default async function globalSetup() {
  const context = await request.newContext({ extraHTTPHeaders: { Origin: settings.storefrontUrl } })
  try {
    for (const [label, url, origin] of [
      ['store e2e', `${settings.api}/storefront`, settings.storefrontUrl],
      ['store e2e-kw', `${settings.api2}/storefront`, settings.storefront2Url],
    ]) {
      let res
      try {
        res = await context.get(url, { headers: { Origin: origin }, timeout: 15_000 })
      } catch (err) {
        throw new Error(`Odoo is not reachable at ${url} (${err.message}). Start it on port 8074 — see e2e/README.md.`)
      }
      if (res.status() !== 200) {
        throw new Error(`${label}: GET ${url} answered ${res.status()}. Is the database seeded? Run tools/e2e_seed.py — see e2e/README.md.`)
      }
      if (res.headers()['access-control-allow-origin'] !== origin) {
        throw new Error(`${label}: Odoo does not allow the origin ${origin}. Re-run the seed with LOOM_E2E_STOREFRONT_URL matching your ports.`)
      }
    }
    const auth = await context.post(`${settings.odooUrl}/web/session/authenticate`, {
      data: { jsonrpc: '2.0', method: 'call', params: { db: settings.db, login: settings.admin.login, password: settings.admin.password } },
    })
    const body = await auth.json().catch(() => null)
    if (!body?.result?.uid) {
      throw new Error(`Cannot sign in to Odoo database "${settings.db}" as ${settings.admin.login}. Set LOOM_E2E_DB / LOOM_E2E_ADMIN_PASSWORD.`)
    }

    // The store throttles sign-in, sign-up and payment attempts per IP and per account for 10-15
    // minutes. A run makes about a dozen of them from 127.0.0.1, so a second run inside that window
    // would be refused with 429s that have nothing to do with the scenarios. Start every run from
    // zero — this is the throwaway test database, never a real store.
    const rpc = async (model, method, args) => {
      const res = await context.post(`${settings.odooUrl}/web/dataset/call_kw/${model}/${method}`, {
        data: { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs: {} } },
      })
      const answer = await res.json()
      if (answer.error) throw new Error(`Odoo ${model}.${method}: ${answer.error.data?.message || answer.error.message}`)
      return answer.result
    }
    const counters = await rpc('loom.rate.limit', 'search', [[]])
    if (counters.length) await rpc('loom.rate.limit', 'unlink', [counters])
  } finally {
    await context.dispose()
  }
}
