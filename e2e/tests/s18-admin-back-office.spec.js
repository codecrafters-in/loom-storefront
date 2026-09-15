/**
 * S-18 — A merchant runs the store from the storefront admin against Odoo: signs in with Odoo, creates a discount
 * code, changes a store setting, exports the catalogue and checks an import, takes a phone order, and finds the
 * returns and reviews queues. Every step lands in Odoo.
 *
 * Roadmap Phase 10.3, "done when": every storefront-admin section works in API mode.
 */
import { readFile } from 'node:fs/promises'
import { test, expect } from '../support/fixtures.js'
import { settings } from '../support/env.js'

test.describe.configure({ mode: 'serial' })

async function signInWithOdoo(page) {
  await page.goto('/admin/login')
  await page.getByRole('button', { name: 'Sign in with Odoo' }).click()
  // Odoo's own login page, then its "continue to the storefront admin" page.
  // A new browser is never signed in to Odoo, so its login page always comes first.
  await page.waitForURL((url) => url.port === new URL(settings.odooUrl).port)
  await page.locator('input[name="login"]').fill(settings.admin.login)
  await page.locator('input[name="password"]').fill(settings.admin.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Continue to the storefront admin' }).click()
  await expect(page).toHaveURL(/\/admin\/?$/)
}

test('S-18 the storefront admin runs on Odoo', { tag: '@S-18' }, async ({ page, odoo, store }) => {
  test.setTimeout(180_000)
  const storeRecord = await odoo.one('loom.store', [['code', '=', 'e2e']], ['id', 'tagline'])
  const code = `E2EADMIN${Date.now().toString(36).toUpperCase()}`

  await signInWithOdoo(page)
  await expect(page.getByText('Returns to handle')).toBeVisible()

  try {
    // Discounts are Odoo loyalty programs.
    await page.goto('/admin/discounts')
    await page.getByRole('button', { name: 'New code' }).click()
    await page.getByLabel('Code', { exact: true }).fill(code)
    await page.getByLabel('Label shown to the shopper').fill('E2E admin code')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(code)).toBeVisible()
    await expect.poll(async () => (await odoo.searchRead('loyalty.rule', [['code', '=', code]], ['id'])).length).toBe(1)

    // A store setting, read back through the store API the storefront uses.
    const tagline = `Tagline from the admin ${Date.now()}`
    await page.goto('/admin/storefront')
    await page.getByLabel('Tagline').fill(tagline)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(/Saved/)).toBeVisible()
    await expect.poll(async () => (await store.ok('GET', '/storefront')).store.tagline).toBe(tagline)

    // The catalogue as a spreadsheet, and an import that is checked before anything is saved.
    await page.goto('/admin/data')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ])
    const csv = await readFile(await download.path(), 'utf8')
    expect(csv.split('\n')[0]).toMatch(/^slug,title,/)
    // Slugs are words, never ending in a number: the second row is refused, and says why.
    const word = Date.now().toString(36).replace(/\d/g, (digit) => 'abcdefghij'[digit])
    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`slug,title,price\ne2e-admin-check-${word},Checked only,9.00\ne2e-admin-check-2,Refused,9.00\n`),
    })
    await expect(page.getByText('Checked e2e-import.csv')).toBeVisible()
    await expect(page.getByText('1 new · 0 updated · 0 categories · 1 problem')).toBeVisible()
    await expect(page.getByText(/Row 3 \(e2e-admin-check-2\): The slug must be lowercase words/)).toBeVisible()
    expect(await odoo.searchRead('product.template', [['loom_slug', '=', `e2e-admin-check-${word}`]], ['id'])).toHaveLength(0)
    await page.getByRole('button', { name: 'Cancel' }).click()

    // A phone order, left as a quotation.
    const { items } = await store.ok('GET', '/products?per_page=24')
    const product = items.find((p) => p.variants?.some((v) => v.available))
    await page.goto('/admin/orders/new')
    await page.locator('#find-product').fill(product.title)
    await page.getByRole('button', { name: 'Find' }).click()
    await page.locator('li', { hasText: product.title }).locator('button:not([disabled])').first().click()
    await page.locator('#order-email').fill('phone-order@e2e.example')
    await page.locator('#order-name').fill('Phone Customer')
    await page.locator('#order-phone').fill('+1 555 0100')
    await page.locator('#order-line1').fill('117 Mercer Street')
    await page.locator('#order-city').fill('New York')
    await page.locator('#order-region').fill('NY')
    await page.locator('#order-postalCode').fill('10012')
    await page.locator('#order-country').fill('US')
    await page.getByLabel(/Quotation only/).check()
    await page.getByRole('button', { name: 'Place order' }).click()
    const heading = page.getByRole('heading', { name: /Order .+ placed/ })
    await expect(heading).toBeVisible({ timeout: 30_000 })
    const number = (await heading.textContent()).match(/Order (\S+) placed/)[1]
    const [order] = await odoo.searchRead('sale.order', [['name', '=', number]], ['state', 'loom_store_id', 'partner_id'])
    expect(order.state).toBe('draft')
    expect(order.loom_store_id[0]).toBe((await odoo.one('loom.store', [['code', '=', 'e2e']], ['id'])).id)

    // The queues shoppers fill.
    await page.goto('/admin/returns')
    await expect(page.getByRole('heading', { name: 'Returns' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /To handle/ })).toBeVisible()
    await page.goto('/admin/reviews?view=questions')
    await expect(page.getByRole('heading', { name: 'Reviews & questions' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /To answer/ })).toBeVisible()
  } finally {
    await odoo.write('loom.store', [storeRecord.id], { tagline: storeRecord.tagline || false })
    const rules = await odoo.searchRead('loyalty.rule', [['code', '=', code]], ['program_id'])
    if (rules.length) await odoo.write('loyalty.program', rules.map((r) => r.program_id[0]), { active: false })
  }
})
