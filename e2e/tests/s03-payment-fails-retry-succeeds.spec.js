/**
 * S-3 — The card is declined, the shopper tries again, it goes through, and
 * there is exactly one order.
 *
 * Checklist: G2 G8 F7. Gap report §6: works from the bag. Retrying payment for
 * an order that was already placed unpaid (G8) is a P1 gap, not covered here.
 */
import { test, expect } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

test('S-3 payment fails, shopper retries, payment succeeds, no duplicate order', { tag: '@S-3' }, async ({ page, shop, odoo }) => {
  const email = uniqueEmail('s3-retry')

  await shop.openProduct('e2e-merino-crew')
  await shop.choose('Colour', 'Red')
  await shop.choose('Size', 'L')
  await shop.addToBag()
  await shop.checkoutFromBag()
  await shop.fillCheckout({ email })
  await shop.continueToPayment()

  await shop.payByDemoCard('error')
  await expect(page.getByRole('alert')).toContainText(/did not go through|declined|failed|error/i)
  await expect(page).toHaveURL(/\/checkout$/)
  await shop.expectBagCount(1)

  await shop.payByDemoCard('done')
  const { number } = await shop.expectOrderConfirmed()
  await shop.expectBagCount(0)

  const orders = await odoo.searchRead('sale.order', [['partner_id.email', '=', email]], ['name', 'state'])
  expect(orders).toEqual([expect.objectContaining({ name: number, state: 'sale' })])

  const order = await odoo.orderByNumber(number)
  const transactions = await odoo.read('payment.transaction', order.transaction_ids, ['state'])
  expect(transactions.map((t) => t.state).sort()).toEqual(['done', 'error'])
})
