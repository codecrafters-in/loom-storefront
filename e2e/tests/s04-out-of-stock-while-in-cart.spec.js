/**
 * S-4 — The last pieces sell elsewhere while an item sits in the bag.
 *
 * Checklist: E3 F11 B13. Gap report §6: 🟡 — caught at checkout, but which line
 * is out of stock isn't shown (no gap number). The part that works has its own
 * test, so a regression there is not hidden behind the expected failure.
 */
import { test, expect, gaps } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

/** Bag an item, empty its shelf in Odoo, and try to pay. Answers the problem the checkout shows. */
async function sellOutDuringCheckout({ page, shop, odoo }, variant, email) {
  await shop.openProduct('e2e-oxford-shirt')
  await shop.choose('Colour', 'Blue')
  await shop.choose('Size', 'M')
  await shop.addToBag()
  await shop.checkoutFromBag()

  // Meanwhile the shelf empties (a sale in the shop, a stock count).
  await odoo.setStock(variant.id, 0)

  await shop.fillCheckout({ email })
  await page.getByRole('button', { name: 'Continue to payment' }).click()
  const problem = page.getByRole('alert').first()
  await expect(problem).toBeVisible({ timeout: 30_000 })
  return problem
}

test('S-4 item goes out of stock while in the bag: checkout stops before payment and nothing is sold', { tag: '@S-4' }, async ({ page, shop, store, odoo }) => {
  const email = uniqueEmail('s4-stock')
  const variant = await store.variant('e2e-oxford-shirt', { Color: 'Blue', Size: 'M' })
  try {
    const problem = await sellOutDuringCheckout({ page, shop, odoo }, variant, email)
    await expect(problem).toContainText(/sold out|out of stock|no longer available/i)
    await expect(shop.payButton()).toBeDisabled()

    const sold = await odoo.searchRead('sale.order', [['partner_id.email', '=', email], ['state', 'in', ['sent', 'sale']]], ['name'])
    expect(sold).toEqual([])
    expect(await odoo.searchRead('payment.transaction', [['partner_email', '=', email]], ['id'])).toEqual([])
  } finally {
    await odoo.setStock(variant.id, 100)
  }
})

test.fail(
  'S-4 item goes out of stock while in the bag: the shopper is told which item sold out',
  gaps('@S-4', '§6 S-4 row (no gap number): the out-of-stock error at checkout does not say which item'),
  async ({ page, shop, store, odoo }) => {
    const variant = await store.variant('e2e-oxford-shirt', { Color: 'Blue', Size: 'M' })
    try {
      const problem = await sellOutDuringCheckout({ page, shop, odoo }, variant, uniqueEmail('s4-which'))
      await expect(problem).toContainText('E2E Oxford Shirt')
    } finally {
      await odoo.setStock(variant.id, 100)
    }
  },
)
