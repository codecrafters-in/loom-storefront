/**
 * S-5 — A customer asks to return an order, the merchant refunds it in Odoo,
 * and the customer can see the refund.
 *
 * Checklist: H9 K6 G9. Gap report §6: ❌ — no returns, no refund status (both
 * listed under §4 P1, without a number).
 */
import { test, expect, gaps } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

test.fail(
  'S-5 customer requests a return, merchant refunds in Odoo, customer sees the refund',
  gaps('@S-5', 'P1 §4: no return / RMA request for customers (H9, K6)', 'P1 §4: refund status never shown to the customer (G9)'),
  async ({ page, shop, store, odoo }) => {
    const { email, password, token } = await store.register({ email: uniqueEmail('s5-return') })
    const variant = await store.variant('e2e-merino-crew', { Color: 'Red', Size: 'M' })
    const { order } = await store.placeOrder({ token, email, lines: [{ variantId: variant.id }] })

    await shop.login(email, password)
    await page.goto(`/order/${order.id}`)
    await expect(page.getByText(order.number).first()).toBeVisible()

    // 1. The customer asks to send it back.
    await page
      .getByRole('button', { name: /request (a )?return|return (items|this order)|start a return/i })
      .or(page.getByRole('link', { name: /request (a )?return|return (items|this order)|start a return/i }))
      .first()
      .click()
    await page.getByLabel(/reason/i).fill('Too small')
    await page.getByRole('button', { name: /submit|send|request/i }).click()
    await expect(page.getByText(/return request(ed)?|we have your return/i).first()).toBeVisible()

    // 2. The merchant refunds it in Odoo: invoice, then a credit note for all of it.
    const saleOrder = await odoo.orderByNumber(order.number)
    const [invoice] = await odoo.invoiceOrder(saleOrder.id)
    const refunds = await odoo.refundInvoice(invoice.id)
    expect(refunds).toHaveLength(1)

    // 3. The customer sees it, on the order page and in the API behind it.
    await page.reload()
    await expect(page.getByText(/refund(ed)?/i).first()).toBeVisible()
    const refreshed = await store.ok('GET', `/orders/${order.id}`, { token })
    expect(JSON.stringify(refreshed)).toMatch(/refund/i)
  },
)
