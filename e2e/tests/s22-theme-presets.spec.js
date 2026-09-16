/**
 * S-22 — A merchant picks a ready-made look in the storefront admin: the storefront shows its colours and fonts, Odoo
 * holds the whole look, and the store's own look comes back afterwards.
 */
import { test, expect } from '../support/fixtures.js'
import { settings } from '../support/env.js'

const LOOK_FIELDS = ['theme_preset', 'color_page', 'color_surface', 'color_ink', 'color_muted', 'color_accent', 'color_accent_ink',
  'color_sale', 'font_heading', 'font_body', 'corner_radius']

async function signInWithOdoo(page) {
  await page.goto('/admin/login')
  await page.getByRole('button', { name: 'Sign in with Odoo' }).click()
  await page.waitForURL((url) => url.port === new URL(settings.odooUrl).port)
  await page.locator('input[name="login"]').fill(settings.admin.login)
  await page.locator('input[name="password"]').fill(settings.admin.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.getByRole('button', { name: 'Continue to the storefront admin' }).click()
  await expect(page).toHaveURL(/\/admin\/?$/)
}

const rgbVar = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

test('S-22 a ready-made look picked in the storefront admin', { tag: '@S-22' }, async ({ page, odoo }) => {
  test.setTimeout(180_000)
  const store = await odoo.one('loom.store', [['code', '=', 'e2e']], ['id', ...LOOK_FIELDS])
  try {
    await signInWithOdoo(page)
    await page.goto('/admin/storefront')
    const midnight = page.locator('[data-preset="midnight"]')
    await expect(midnight).toBeVisible()
    await expect(page.locator('[data-preset]')).toHaveCount(12)
    await midnight.click()
    await expect(midnight).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText(/Saved/)).toBeVisible()

    const [saved] = await odoo.call('loom.store', 'read', [[store.id], LOOK_FIELDS])
    expect(saved.theme_preset).toBe('midnight')
    expect([saved.color_page, saved.color_accent, saved.font_heading, saved.corner_radius]).toEqual(['#0E1116', '#7AA2F7', 'Manrope', 'medium'])

    await page.goto('/')
    await expect.poll(() => rgbVar(page, '--page')).toBe('14 17 22')
    expect(await rgbVar(page, '--accent')).toBe('122 162 247')
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-display'))).toContain('Manrope')
  } finally {
    const restore = Object.fromEntries(LOOK_FIELDS.map((f) => [f, store[f]]))
    await odoo.call('loom.store', 'write', [[store.id], restore])
  }
})
