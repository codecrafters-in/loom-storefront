/**
 * S-2 — A registered customer buys two variants, applies a discount code, pays
 * cash on delivery and finds the order in their account.
 *
 * Checklist: I1 D2 E5 G7 H3. Gap report §6: works (Colour × Size products only;
 * a code cannot be removed — not asserted here).
 */
import { test, expect } from '../support/fixtures.js'
import { settings, uniqueEmail } from '../support/env.js'
import { US_ADDRESS } from '../support/store-api.js'

test('S-2 registered customer: two variants, discount code, cash on delivery, order in account', { tag: '@S-2' }, async ({ page, shop, odoo }) => {
  const email = uniqueEmail('s2-member')

  await shop.register({ firstName: 'Riley', lastName: 'Member', email, password: 'e2e-s2-password' })
  await expect(page).toHaveURL(/\/account/)

  await shop.openProduct('e2e-merino-crew')
  await shop.choose('Colour', 'Red')
  await shop.choose('Size', 'S')
  await shop.addToBag()
  await shop.closeBag()
  await shop.choose('Colour', 'Blue')
  await shop.choose('Size', 'L')
  await shop.addToBag()
  await shop.expectBagCount(2)

  await page.goto('/cart')
  await expect(page.getByText('2 items', { exact: true })).toBeVisible()
  await page.getByLabel('Discount code').fill(settings.promoCode)
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(new RegExp(`${settings.promoCode} —`))).toBeVisible()
  await expect(shop.summaryValue('Subtotal')).toHaveText('$160.00')
  await expect(shop.main().getByText('−$16.00')).toBeVisible()

  await shop.main().getByRole('link', { name: 'Checkout', exact: true }).click()
  await expect(page.locator('#email')).toHaveValue(email)
  await shop.fillCheckout({ address: US_ADDRESS })
  await shop.continueToPayment()
  await shop.choosePayment(/^Cash on Delivery/)
  await shop.pay()
  const { number } = await shop.expectOrderConfirmed()

  await page.getByRole('link', { name: 'Your orders' }).click()
  await expect(page).toHaveURL(/\/account\/orders/)
  await expect(page.getByText(`Order ${number}`, { exact: true })).toBeVisible()

  const order = await odoo.orderByNumber(number)
  expect(order.state).toBe('sale') // cash on delivery confirms the order; the money comes later
  const partner = await odoo.one('res.partner', [['id', '=', order.partner_id[0]]], ['email', 'user_ids'])
  expect(partner.email).toBe(email)
  expect(partner.user_ids).toHaveLength(1)

  const lines = await odoo.read('sale.order.line', order.order_line, ['name', 'product_uom_qty', 'is_delivery', 'reward_id', 'price_subtotal'])
  const goods = lines.filter((l) => !l.is_delivery && !l.reward_id)
  expect(goods.map((l) => l.name).join('\n')).toMatch(/Red.*S/)
  expect(goods.map((l) => l.name).join('\n')).toMatch(/Blue.*L/)
  expect(goods).toHaveLength(2)
  const discount = lines.filter((l) => l.reward_id)
  expect(discount.reduce((sum, l) => sum + l.price_subtotal, 0)).toBeCloseTo(-16, 2)

  const transactions = await odoo.read('payment.transaction', order.transaction_ids, ['state', 'provider_code'])
  expect(transactions).toEqual([expect.objectContaining({ provider_code: 'custom', state: 'pending' })])
})
