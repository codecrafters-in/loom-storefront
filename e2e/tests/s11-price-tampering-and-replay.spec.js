/**
 * S-11 — A shopper edits prices and quantities in devtools and replays
 * requests. The server's prices win and nothing is charged or sold twice.
 *
 * Checklist: O4 O5 F7. Gap report §6: works (discount-code brute force and cart
 * spam are unthrottled — P1, not covered here).
 */
import { test, expect } from '../support/fixtures.js'
import { uniqueEmail } from '../support/env.js'

const isCartPayments = (url) => /\/carts\/[^/]+\/payments$/.test(new URL(url).pathname)

test('S-11 tampered price, quantity and expected total are ignored or refused; replayed payment requests do nothing', { tag: '@S-11' }, async ({ page, shop, store, odoo }) => {
  const email = uniqueEmail('s11-tamper')

  // 1. The add-to-bag request is rewritten with a price and a negative quantity: refused (the quantity
  //    rules answer 422), so nothing is added. Retried untouched, the server's price is charged.
  await page.route('**/carts/*/lines', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.continue()
    const body = { ...request.postDataJSON(), price: 0.01, price_unit: 0.01, list_price: 0.01, amount: 1, quantity: -5 }
    return route.continue({ postData: JSON.stringify(body) })
  })
  await shop.openProduct('e2e-merino-crew')
  await shop.choose('Colour', 'Blue')
  await shop.choose('Size', 'S')
  const tampered = page.waitForResponse((r) => /\/carts\/[^/]+\/lines$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
  await shop.addToBagButton().click()
  expect((await tampered).status()).toBe(422)
  await page.unroute('**/carts/*/lines')
  await shop.addToBag()

  const cartId = await page.evaluate(() => localStorage.getItem('loom.cart_id'))
  const cart = await store.ok('GET', `/carts/${cartId}`)
  expect(cart.lines).toHaveLength(1)
  expect(cart.lines[0]).toMatchObject({ quantity: 1, lineTotal: { amount: 8000, currency: 'USD' } })

  // 2. The payment request claims a total of $1.00.
  await shop.checkoutFromBag()
  await shop.fillCheckout({ email })
  await shop.continueToPayment()
  await page.route('**/carts/*/payments', async (route) =>
    route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), expected_total: 100 }) }),
  )
  await shop.payByDemoCard('done')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.unroute('**/carts/*/payments')
  expect(await odoo.searchRead('payment.transaction', [['partner_email', '=', email]], ['id'])).toEqual([])

  // 3. Paying honestly works, for the server's total.
  const created = page.waitForResponse((r) => isCartPayments(r.url()) && r.request().method() === 'POST' && r.ok())
  await shop.payByDemoCard('done')
  const paymentResponse = await created
  const honestBody = paymentResponse.request().postDataJSON()
  const payment = await paymentResponse.json()
  const { number } = await shop.expectOrderConfirmed()

  const order = await odoo.orderByNumber(number)
  expect(order.amount_untaxed).toBeCloseTo(85, 2) // $80 shirt + $5 shipping

  // 4. Replaying the payment and the card step changes nothing.
  const replayPay = await store.call('POST', `/carts/${cartId}/payments`, { body: honestBody })
  expect([404, 409]).toContain(replayPay.status)
  const replaySimulate = await store.call('POST', `/payments/${payment.id}/actions/simulate`, { body: { outcome: 'done', cardNumber: '4242' } })
  expect(replaySimulate.status === 200 ? replaySimulate.json.status : replaySimulate.status).not.toBe('draft')

  const transactions = await odoo.searchRead('payment.transaction', [['sale_order_ids', 'in', [order.id]]], ['state', 'amount'])
  expect(transactions).toEqual([expect.objectContaining({ state: 'done', amount: order.amount_total })])
  expect(await odoo.searchRead('sale.order', [['partner_id.email', '=', email], ['state', '!=', 'draft']], ['id'])).toHaveLength(1)
})
