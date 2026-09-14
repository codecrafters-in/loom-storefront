/**
 * Accessibility: the shopper-facing pages have no serious or critical WCAG 2.x
 * A/AA violations (axe), and the bag drawer can be used with a keyboard alone.
 *
 * Checklist: O8.
 */
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/fixtures.js'

const PAGES = [
  ['home page', '/'],
  ['shop', '/shop'],
  ['product page', '/product/e2e-merino-crew'],
  ['bag', '/cart'],
  ['contact page', '/pages/contact'],
  ['order lookup', '/orders/lookup'],
  ['sign in', '/login'],
]

for (const [name, path] of PAGES) {
  test(`accessibility: the ${name} has no serious issues`, { tag: '@a11y' }, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('#main')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes.length}): ${v.help} — ${v.nodes[0]?.target?.join(' ')}`)
    expect(serious).toEqual([])
  })
}

test('keyboard: the bag drawer takes focus, keeps it and gives it back', { tag: '@a11y' }, async ({ page, shop }) => {
  await page.goto('/shop')
  const bagButton = shop.bagButton()
  await bagButton.focus()
  await page.keyboard.press('Enter')
  const drawer = shop.bagDrawer()
  await expect(drawer).toBeInViewport()
  await expect.poll(() => drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab')
  await expect.poll(() => drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(bagButton).toBeFocused()
})
