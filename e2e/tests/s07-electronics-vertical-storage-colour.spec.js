/**
 * S-7 — The merchant adds an electronics product in Odoo with its own
 * specifications and Storage × Colour variants, and a shopper can buy it.
 *
 * Checklist: B2 B9 R3. Gap report §6: ❌ — can't add to bag (#1); apparel spec
 * labels (#2). Both fixed in Phase 2: a picker for any option, and specification
 * labels sent by Odoo.
 */
import { test, expect } from '../support/fixtures.js'

test(
  'S-7 electronics product: own specifications, Storage × Colour variant bought at its own price',
  { tag: '@S-7' },
  async ({ page, shop }) => {
    await shop.openProduct('e2e-nova-phone')

    // Specifications as the merchant labelled them in Odoo (category properties).
    const specsTab = page.getByRole('tab', { name: 'Specifications' }).or(page.getByRole('button', { name: 'Specifications' }))
    if (await specsTab.count()) await specsTab.first().click()
    await expect.soft(page.getByText('Screen size', { exact: true }).first()).toBeVisible()
    await expect.soft(page.getByText('6.1 in').first()).toBeVisible()
    await expect.soft(page.getByText('Battery capacity', { exact: true }).first()).toBeVisible()
    await expect.soft(page.getByText('e2e_screen')).toHaveCount(0)

    // The 256 GB silver phone, at its own price.
    await shop.choose('Storage', '256 GB')
    await shop.choose('Colour', 'Silver')
    await expect(page.getByText('$799.00').first()).toBeVisible()
    await shop.addToBag()
    await shop.expectBagCount(1)
    const line = shop.bagDrawer().getByRole('listitem').filter({ hasText: 'E2E Nova Phone' })
    await expect(line).toContainText('256 GB')
    await expect(line).toContainText('Silver')
    await expect(line).toContainText('$799.00')
  },
)
