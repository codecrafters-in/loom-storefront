/**
 * S-9 — Two stores on the same Odoo: catalogue, orders, customers and branding
 * stay separate.
 *
 * Store `e2e` (port 5174) and store `e2e-kw` (port 5175, a second website).
 * Checklist: A10 O3. Gap report §6: size charts / attributes leaked (#26), fixed in Phase 1:
 * library records now belong to stores, and each store only serves its own and shared ones.
 * It also lists sign-up as broken on a second website (#13); on this Odoo 19
 * build a new website defaults to free sign-up (website_sale overrides the
 * field default), so sign-up on the second store is checked in the test that
 * passes. The part that works has its own test, so a regression there is not
 * hidden behind the expected failure.
 */
import { test, expect } from '../support/fixtures.js'
import { settings, uniqueEmail } from '../support/env.js'
import { Shop } from '../support/shop.js'

/** `prefix`: a language address. The Kuwait store's default language is Arabic; this test reads it in English. */
async function openStore(browser, baseURL, { prefix = '' } = {}) {
  const context = await browser.newContext({ baseURL })
  return { context, shop: new Shop(await context.newPage(), { prefix }) }
}

test('S-9 two stores on one Odoo: catalogue, orders, sign-up and branding are separate', { tag: '@S-9' }, async ({ browser, page, shop, store }) => {
  const { email, password, token } = await store.register({ email: uniqueEmail('s9-customer') })
  const variant = await store.variant('e2e-merino-crew', { Color: 'Blue', Size: 'S' })
  const { order } = await store.placeOrder({ token, email, lines: [{ variantId: variant.id }] })

  const kw = await openStore(browser, settings.storefront2Url, { prefix: '/en' })
  try {
    // Branding: each storefront is its own shop.
    await page.goto('/')
    await expect(page).toHaveTitle(/E2E Store/)
    await kw.shop.page.goto('/en/')
    await expect(kw.shop.page).toHaveTitle(/E2E Kuwait Store/)

    // Catalogue: a product of one website is not sold on the other.
    await kw.shop.search('mug')
    await expect(kw.shop.page.getByText(/^0 results$/)).toBeVisible()
    await kw.shop.search('oud')
    await expect(kw.shop.page.getByText(/^1 result$/)).toBeVisible()
    await expect(kw.shop.page.getByRole('link', { name: 'E2E Oud Perfume' }).first()).toBeVisible()
    await shop.search('oud')
    await expect(page.getByText(/^0 results$/)).toBeVisible()

    // Orders: an order placed on store e2e is not in the account on store e2e-kw.
    await kw.shop.login(email, password)
    await kw.shop.page.goto('/en/account/orders')
    await expect(kw.shop.page.getByText('No orders yet', { exact: false }).first()).toBeVisible()
    await expect(kw.shop.page.getByText(`Order ${order.number}`)).toHaveCount(0)

    await shop.login(email, password)
    await page.goto('/account/orders')
    await expect(page.getByText(`Order ${order.number}`, { exact: true })).toBeVisible()
  } finally {
    await kw.context.close()
  }

  // Customers: a new shopper can create an account on the second store.
  const signup = await openStore(browser, settings.storefront2Url, { prefix: '/en' })
  try {
    await signup.shop.register({ firstName: 'Noor', lastName: 'Kuwait', email: uniqueEmail('s9-kw-signup'), password: 'e2e-s9-password' })
    await expect(signup.shop.page).toHaveURL(/\/account/, { timeout: 20_000 })
  } finally {
    await signup.context.close()
  }
})

test(
  'S-9 two stores on one Odoo: one store\'s size charts are not served by the other store',
  { tag: '@S-9' },
  async ({ store2 }) => {
    // A size chart the e2e store's merchant made for its knitwear; the Kuwait store sells no knitwear.
    const charts = await store2.ok('GET', '/size-charts')
    expect(charts.items.map((c) => c.id)).not.toContain('e2e-knitwear')
  },
)
