/**
 * S-10 — A B2B customer signs in and sees their own prices; their tax ID is on
 * the invoice.
 *
 * Checklist: D6 F9 I11. Gap report §6: ✅ since Phase 5 — pricelist works, and
 * checkout takes a company name and VAT (#16). The seeded trade buyer's company
 * already has a VAT number in Odoo; the second test is the buyer who gives it at
 * checkout, where it goes on their contact as the company name and tax ID that
 * Odoo prints on the invoice.
 */
import { test, expect } from '../support/fixtures.js'
import { settings, uniqueEmail } from '../support/env.js'

test('S-10 B2B customer signs in, sees the trade pricelist, and the invoice carries the company tax ID', { tag: '@S-10' }, async ({ page, shop, odoo }) => {
  const { email, password, company, vat } = settings.b2b

  await shop.login(email, password)
  await shop.openProduct('e2e-merino-crew')
  await expect(page.getByText('$64.00').first()).toBeVisible() // $80 list, 20% trade discount
  await shop.choose('Colour', 'Red')
  await shop.choose('Size', 'M')
  await shop.addToBag()
  await expect(shop.bagDrawer()).toContainText('$64.00')

  await shop.checkoutFromBag()
  await shop.fillCheckout()
  await shop.continueToPayment()
  await shop.choosePayment(/^Cash on Delivery/)
  await shop.pay()
  const { number } = await shop.expectOrderConfirmed()

  const order = await odoo.orderByNumber(number, ['pricelist_id'])
  expect(order.pricelist_id[1]).toMatch(/E2E Trade/)
  const lines = await odoo.read('sale.order.line', order.order_line, ['is_delivery', 'price_subtotal'])
  expect(lines.filter((l) => !l.is_delivery).map((l) => l.price_subtotal)).toEqual([64])

  const [invoice] = await odoo.invoiceOrder(order.id)
  expect(invoice.commercial_partner_id[1]).toBe(company)
  const [partner] = await odoo.read('res.partner', [invoice.commercial_partner_id[0]], ['vat'])
  expect(partner.vat).toBe(vat)
})

test(
  'S-10 business buyer enters company name and VAT at checkout; both are on the invoice',
  { tag: '@S-10' },
  async ({ page, shop, odoo }) => {
    const company = 'Acme Imports LLC'
    const vat = 'US555666777'

    await shop.openProduct('e2e-merino-crew')
    await shop.choose('Colour', 'Blue')
    await shop.choose('Size', 'M')
    await shop.addToBag()
    await shop.checkoutFromBag()
    await shop.fillCheckout({ email: uniqueEmail('s10-business') })
    await page.getByLabel(/buying for a business/i).check()
    await page.getByLabel('Company name').fill(company)
    await page.getByLabel(/tax id/i).fill(vat)
    await shop.continueToPayment()
    await shop.choosePayment(/^Cash on Delivery/)
    await shop.pay()
    const { number } = await shop.expectOrderConfirmed()

    const order = await odoo.orderByNumber(number)
    const [invoice] = await odoo.invoiceOrder(order.id)
    const [partner] = await odoo.read('res.partner', [invoice.commercial_partner_id[0]], ['commercial_company_name', 'vat'])
    expect(partner).toMatchObject({ commercial_company_name: company, vat })
  },
)
