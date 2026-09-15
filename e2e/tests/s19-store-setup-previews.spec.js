/**
 * S-19 — A merchant sets the store up in Odoo and sees, on every tab, how it will look on the storefront.
 *
 * Each tab of the store form draws its part of the storefront next to its fields (home page, menu and footer, look,
 * contact details, product page, checkout, emails, features, privacy, search results, pages, catalogue), and the
 * drawing follows the fields before anything is saved.
 */
import { test, expect } from '../support/fixtures.js'
import { settings } from '../support/env.js'

async function signInToOdoo(page) {
  await page.goto(`${settings.odooUrl}/web/login`)
  await page.locator('input[name="login"]').fill(settings.admin.login)
  await page.locator('input[name="password"]').fill(settings.admin.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/web/login'))
}

const TABS = {
  Setup: 'Catalogue',
  Look: 'Each colour on its own',
  Contact: 'Get in touch',
  'Home page': 'The whole page on the storefront',
  Navigation: 'How it looks on the storefront',
  Pages: 'Add missing starter pages',
  'Product page': 'Add to bag',
  'Checkout & orders': 'Place order',
  Emails: 'An order email',
  'Features & accounts': 'The search box in the header',
  'Privacy & access': 'What a visitor sees',
  'SEO & analytics': 'robots.txt',
}

test('S-19 every store tab shows how it looks on the storefront', { tag: '@S-19' }, async ({ page, odoo }) => {
  test.setTimeout(240_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  const store = await odoo.one('loom.store', [['code', '=', 'e2e']], ['id'])

  await signInToOdoo(page)
  await page.goto(`${settings.odooUrl}/web#id=${store.id}&model=loom.store&view_type=form`)
  const tabs = page.locator('.o_form_view .o_notebook .nav-link')
  await expect(tabs.first()).toBeVisible({ timeout: 90_000 })

  for (const [tab, text] of Object.entries(TABS)) {
    await tabs.filter({ hasText: tab }).first().click()
    await expect(page.locator('.o_notebook .tab-pane.active'), `${tab} draws its preview`).toContainText(text, { timeout: 30_000 })
  }

  // Typed, not saved: the Look preview already shows it.
  await tabs.filter({ hasText: 'Look' }).first().click()
  const tagline = `Preview check ${Date.now().toString(36)}`
  await page.locator('.o_notebook .tab-pane.active div[name="tagline"] input').fill(tagline)
  await page.locator('.o_notebook .tab-pane.active div[name="color_page"]').click()
  await expect(page.locator('.o_notebook .tab-pane.active div[name="look_preview_html"]')).toContainText(tagline, { timeout: 30_000 })
  await page.locator('.o_form_button_cancel').first().click()

  expect(errors, 'no JavaScript error in Odoo').toEqual([])
})
