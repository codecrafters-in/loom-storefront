/**
 * S-6 — The merchant schedules a 20% weekend sale and free shipping over $100
 * in Odoo; the running storefront applies them with no redeploy, and a sale
 * scheduled for next week does not apply yet.
 *
 * Checklist: D4 D5 P1. Gap report §6: works (a cached catalogue may lag; the
 * suite runs with the API cache off).
 */
import { test, expect } from '../support/fixtures.js'

const day = (offset) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

const promotion = (name, percent, from, to) => ({
  name,
  program_type: 'promotion',
  trigger: 'auto',
  applies_on: 'current',
  date_from: from,
  date_to: to,
  rule_ids: [[0, 0, { minimum_amount: 0, minimum_qty: 1, reward_point_mode: 'order', reward_point_amount: 1 }]],
  reward_ids: [[0, 0, { reward_type: 'discount', discount: percent, discount_mode: 'percent', discount_applicability: 'order', required_points: 1 }]],
})

test('S-6 merchant schedules a 20% sale and free shipping over $100 in Odoo; storefront applies them without a redeploy', { tag: '@S-6' }, async ({ page, shop, odoo }) => {
  const carrier = await odoo.one('delivery.carrier', [['loom_code', '=', 'standard']], ['free_over', 'amount'])
  const programs = []

  try {
    programs.push(await odoo.create('loyalty.program', promotion('E2E Weekend Sale 20%', 20, day(-1), day(1))))
    programs.push(await odoo.create('loyalty.program', promotion('E2E Next Week 50%', 50, day(7), day(9))))
    await odoo.write('delivery.carrier', [carrier.id], { free_over: true, amount: 100 })

    await shop.openProduct('e2e-merino-crew')
    await shop.choose('Colour', 'Red')
    await shop.choose('Size', 'S')
    await shop.addToBag()
    await shop.closeBag()
    await shop.choose('Colour', 'Blue')
    await shop.choose('Size', 'S')
    await shop.addToBag()

    await page.goto('/cart')
    await expect(shop.summaryValue('Subtotal')).toHaveText('$160.00')
    await expect(shop.main().getByText('−$32.00')).toBeVisible() // 20%, and not next week's 50%
    await expect(shop.summaryValue('Shipping')).toHaveText('Free') // $128 is over $100
  } finally {
    if (programs.length) await odoo.write('loyalty.program', programs, { active: false })
    await odoo.write('delivery.carrier', [carrier.id], { free_over: carrier.free_over, amount: carrier.amount })
  }
})
