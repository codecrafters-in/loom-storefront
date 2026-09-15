/**
 * S-5 — A customer returns a delivered order, the merchant refunds it in Odoo,
 * and the customer can see the refund.
 *
 * Checklist: H9 K6 G9. Gap report §6: ✅ since Phase 9 — returns with reasons from
 * the order page, handled in Storefront › Returns, and the refund on the order's
 * progress and in the returns list.
 */
import { test, expect } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

test(
  'S-5 customer returns a delivered order, merchant refunds it in Odoo, customer sees the refund',
  { tag: '@S-5' },
  async ({ page, shop, store, odoo }) => {
    const { email, password, token } = await store.register({ email: uniqueEmail('s5-return') })
    const variant = await store.variant('e2e-merino-crew', { Color: 'Red', Size: 'M' })
    const { order } = await store.placeOrder({ token, email, lines: [{ variantId: variant.id }] })
    const saleOrder = await odoo.orderByNumber(order.number)
    await odoo.deliverOrder(saleOrder.id)

    await shop.login(email, password)
    await page.goto(`/order/${order.id}`)
    await expect(page.getByText(order.number).first()).toBeVisible()

    // 1. The customer asks to send it back.
    await page.getByRole('button', { name: 'Return items' }).click()
    await page.getByRole('checkbox', { name: /Merino/ }).check()
    await page.getByLabel('Reason', { exact: true }).selectOption({ label: 'Too small' })
    await page.getByRole('radio', { name: 'Refund to the way I paid' }).check()
    await page.getByRole('button', { name: 'Send return request' }).click()
    await expect(page.getByText(/Return RET-\d+ sent/)).toBeVisible()

    // 2. The merchant approves it, receives the parcel and refunds it (Storefront › Returns in Odoo).
    const [request] = await odoo.searchRead('loom.return.request', [['order_id', '=', saleOrder.id]], ['id', 'state'])
    expect(request.state).toBe('requested')
    for (const step of ['action_approve', 'action_receive', 'action_refund']) {
      await odoo.call('loom.return.request', step, [[request.id]])
    }

    // 3. The customer sees it: on the order page, in the API behind it, and under Account › Returns.
    await page.reload()
    await expect(page.getByText('Refunded').first()).toBeVisible()
    const refreshed = await store.ok('GET', `/orders/${order.id}`, { token })
    expect(refreshed.refundedTotal.amount).toBeGreaterThan(0)
    await page.goto('/account/returns')
    await expect(page.getByText('Refunded').first()).toBeVisible()
  },
)
