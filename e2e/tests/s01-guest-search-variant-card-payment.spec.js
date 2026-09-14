/**
 * S-1 — A guest finds a product through search, picks a variant, pays by card,
 * gets an email, and the order is in Odoo with a delivery and an invoice.
 *
 * Checklist: C3 B2 E1 F1 F4 G1 G3 H1 H2 K1. Gap report §6: works for a
 * Colour × Size product with an on-site gateway that has a driver (Demo here).
 */
import { test, expect } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'
import { US_ADDRESS } from '../support/store-api.js'

test('S-1 guest: search → variant → card payment → email → order in Odoo with delivery and invoice', { tag: '@S-1' }, async ({ page, shop, store, odoo }) => {
  const email = uniqueEmail('s1-guest')

  await page.goto('/')
  await shop.search('merino')
  await expect(page.getByText(/^1 result$/)).toBeVisible()
  await page.getByRole('link', { name: 'E2E Merino Crew' }).first().click()
  await expect(page.getByRole('heading', { name: 'E2E Merino Crew', level: 1 })).toBeVisible()

  await shop.choose('Colour', 'Blue')
  await shop.choose('Size', 'M')
  await shop.addToBag()
  await shop.expectBagCount(1)

  await shop.checkoutFromBag()
  await shop.fillCheckout({ email, address: US_ADDRESS })
  await shop.continueToPayment()
  await shop.payByDemoCard('done')

  const { number, orderId } = await shop.expectOrderConfirmed()
  await expect(page.getByRole('heading', { name: 'Thank you.', level: 1 })).toBeVisible()

  // The bag is spent, in the header and after a reload.
  await shop.expectBagCount(0)
  await page.reload()
  await shop.expectBagCount(0)

  // What the storefront's order page is built from.
  const order = await store.ok('GET', `/orders/${orderId}`)
  expect(order.number).toBe(number)
  expect(order.email).toBe(email)
  expect(order.payment.status).toBe('captured')
  expect(order.lines).toHaveLength(1)
  expect(order.lines[0]).toMatchObject({ title: 'E2E Merino Crew', quantity: 1, options: { Color: 'Blue', Size: 'M' } })

  // The back office: a confirmed website order, paid, with a delivery to ship.
  const saleOrder = await odoo.orderByNumber(number)
  expect(saleOrder.state).toBe('sale')
  expect(saleOrder.website_id[1]).toBe('E2E Shop')
  expect(saleOrder.loom_store_id[1]).toBe('E2E Store')
  expect(Math.round(saleOrder.amount_total * 100)).toBe(order.total.amount)

  const transactions = await odoo.read('payment.transaction', saleOrder.transaction_ids, ['state', 'provider_code'])
  expect(transactions).toEqual([expect.objectContaining({ state: 'done', provider_code: 'demo' })])

  const pickings = await odoo.read('stock.picking', saleOrder.picking_ids, ['picking_type_code', 'state'])
  expect(pickings.filter((p) => p.picking_type_code === 'outgoing' && p.state !== 'cancel')).toHaveLength(1)

  // Invoiced (automatically when Odoo is set to, otherwise from the order, as the back office would).
  const invoices = await odoo.invoiceOrder(saleOrder.id)
  expect(invoices).toEqual([
    expect.objectContaining({ move_type: 'out_invoice', state: 'posted', amount_total: saleOrder.amount_total }),
  ])

  // The confirmation email went to the shopper.
  const messages = await odoo.messages('sale.order', saleOrder.id)
  const toShopper = messages.filter((m) => m.partner_ids.includes(saleOrder.partner_id[0]))
  expect(toShopper.map((m) => m.subject || '').join(' | ')).toContain(number)
})
