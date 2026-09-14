/**
 * S-13 — The merchant changes a price in Odoo while the product sits in a bag,
 * even while the shopper is on the payment step. The shopper sees the new price
 * and is never charged the old one.
 *
 * Checklist: E4. Gap report §6: 🟡 — recomputed for carts that ship; a
 * service-only cart is never repriced before payment (#14). This suite also
 * found that the bag itself keeps showing the old price until checkout.
 */
import { test, expect, gaps, newBug } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

/** Pay; if the storefront refuses because the total moved, pay again at the new total. */
async function payThroughPriceChange(page, shop) {
  await shop.payByDemoCard('done')
  const refused = page.getByRole('alert')
  const confirmed = page.getByRole('heading', { name: 'Thank you.', level: 1 })
  await expect(refused.or(confirmed).first()).toBeVisible({ timeout: 60_000 })
  if (await refused.isVisible()) await shop.payByDemoCard('done')
  return shop.expectOrderConfirmed()
}

async function bagAnOxfordShirt(shop) {
  await shop.openProduct('e2e-oxford-shirt')
  await shop.choose('Colour', 'Black')
  await shop.choose('Size', 'S')
  await shop.addToBag()
  await expect(shop.bagDrawer()).toContainText('$60.00')
}

test('S-13 price changes in Odoo while a shippable product is in the bag and on the payment step: the order is charged the new price', { tag: '@S-13' }, async ({ page, shop, odoo }) => {
  const email = uniqueEmail('s13-goods')
  try {
    await bagAnOxfordShirt(shop)
    await odoo.setListPrice('E2E Oxford Shirt', 70)

    await shop.closeBag()
    await page.goto('/checkout')
    await shop.fillCheckout({ email })
    await shop.continueToPayment()
    await expect(shop.main().getByText('$70.00').first()).toBeVisible()

    await odoo.setListPrice('E2E Oxford Shirt', 75)
    const { number } = await payThroughPriceChange(page, shop)

    const order = await odoo.orderByNumber(number)
    const lines = await odoo.read('sale.order.line', order.order_line, ['is_delivery', 'price_subtotal'])
    expect(lines.filter((l) => !l.is_delivery).map((l) => l.price_subtotal)).toEqual([75])
  } finally {
    await odoo.setListPrice('E2E Oxford Shirt', 60)
  }
})

test.fail(
  'S-13 price changes in Odoo while a product is in the bag: the bag shows the new price before checkout',
  newBug(
    '@S-13',
    'GET /carts/:id does not reprice lines after a product price change (controllers/api_cart.py get, same spot as #17); ' +
      'the bag shows the old price until the payment step, although API_REFERENCE.md says it answers a repriced cart',
  ),
  async ({ page, shop, odoo }) => {
    try {
      await bagAnOxfordShirt(shop)
      await odoo.setListPrice('E2E Oxford Shirt', 70)

      await page.goto('/cart')
      await expect(shop.main().locator('li').filter({ hasText: 'E2E Oxford Shirt' })).toContainText('$70.00')
      await expect(shop.summaryValue('Subtotal')).toHaveText('$70.00')
    } finally {
      await odoo.setListPrice('E2E Oxford Shirt', 60)
    }
  },
)

test.fail(
  'S-13 price changes in Odoo while a service (nothing to ship) is on the payment step: the order is charged the new price',
  gaps('@S-13', '#14 service/digital-only carts are never repriced before payment'),
  async ({ page, shop, store, odoo }) => {
    const email = uniqueEmail('s13-service')
    try {
      // The bag is prepared through the API: adding a product without options from the product
      // page is blocked by gap #1, which is not what this scenario is about.
      const service = await store.product('e2e-styling-session')
      const cart = await store.ok('POST', '/carts', { body: {} })
      await store.ok('POST', `/carts/${cart.id}/lines`, { body: { variant_id: service.variants[0].id, quantity: 1 } })
      await page.addInitScript((id) => localStorage.setItem('loom.cart_id', id), cart.id)

      await page.goto('/checkout')
      await shop.fillCheckout({ email })
      await shop.continueToPayment()
      await odoo.setListPrice('E2E Styling Session', 90)
      const { number } = await payThroughPriceChange(page, shop)

      const order = await odoo.orderByNumber(number)
      expect(order.amount_untaxed).toBeCloseTo(90, 2)
    } finally {
      await odoo.setListPrice('E2E Styling Session', 60)
    }
  },
)
