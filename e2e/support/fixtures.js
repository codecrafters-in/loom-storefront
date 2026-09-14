/**
 * `test` with the four things every scenario reaches for.
 *
 *   shop    the shopper, in the browser (store `e2e`)
 *   odoo    the merchant, through Odoo's JSON-RPC API
 *   store   the store API of `e2e`, for preconditions and reading outcomes
 *   store2  the store API of `e2e-kw`, the second website on the same Odoo
 *
 * Blocked scenarios are declared with `test.fail(title, gaps(...), body)`: the
 * body is the real business test, Playwright expects it to fail today, and the
 * run reports "unexpectedly passed" the day a phase closes the gap — the signal
 * to delete the `.fail`.
 */
import { test as base, expect } from '@playwright/test'
import { settings } from './env.js'
import { Odoo } from './odoo.js'
import { Shop } from './shop.js'
import { StoreApi } from './store-api.js'

export const test = base.extend({
  shop: async ({ page }, use) => {
    await use(new Shop(page))
  },
  odoo: async ({ playwright }, use) => {
    const odoo = await Odoo.connect(playwright)
    await use(odoo)
    await odoo.dispose()
  },
  store: async ({ playwright }, use) => {
    const api = await StoreApi.create(playwright)
    await use(api)
    await api.dispose()
  },
  store2: async ({ playwright }, use) => {
    const api = await StoreApi.create(playwright, { base: settings.api2, origin: settings.storefront2Url })
    await use(api)
    await api.dispose()
  },
})

/** Test details naming the gap(s) from loom-audit/02-gap-report.md that block a scenario. */
export const gaps = (tag, ...descriptions) => ({
  tag,
  annotation: descriptions.map((description) => ({ type: 'gap', description })),
})

/** Test details for a bug found by this suite that the gap report does not list. */
export const newBug = (tag, description) => ({ tag, annotation: [{ type: 'new-bug', description }] })

export { expect }
