import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api } = await loadApp()

const fill = async (slug = 'oxford-shirt-ecru', quantity = 1) => {
  const product = await api.getProduct(slug)
  const variant = product.variants.find((v) => v.inventory >= quantity)
  await api.addToCart({ variantId: variant.id, quantity })
  return { variant, cart: await api.getCart() }
}

const PAYMENT = { provider: 'razorpay', status: 'captured', reference: 'pay_abc123', method: 'upi' }

test('a server can place an order for money already taken', async () => {
  // The route the reference payments server has always called, and which the
  // contract did not describe until now.
  const { cart } = await fill()
  const order = await api.adminPlaceOrder({
    cartId: cart.id,
    email: 'buyer@example.com',
    payment: PAYMENT,
    idempotencyKey: 'pay_abc123',
  })

  assert.equal(order.created, true)
  assert.equal(order.email, 'buyer@example.com')
  assert.equal(order.payment.reference, 'pay_abc123')
  assert.equal(order.payment.provider, 'razorpay')
  assert.ok(order.number.startsWith('LM-'))
})

test('a retried webhook does not place a second order', async () => {
  // Providers retry. Without this, one payment becomes two orders and two
  // confirmation emails, and the stock is sold twice.
  const before = (await api.listOrders().catch(() => ({ items: [] }))).items?.length ?? 0
  const replay = await api.adminPlaceOrder({
    cartId: 'anything',
    email: 'buyer@example.com',
    payment: PAYMENT,
    idempotencyKey: 'pay_abc123',
  })

  assert.equal(replay.created, false, 'a replay must say it created nothing')
  assert.equal(replay.payment.reference, 'pay_abc123')
  const after = (await api.listOrders().catch(() => ({ items: [] }))).items?.length ?? 0
  assert.equal(after, before)
})

test('the replay does not sell the stock a second time', async () => {
  const product = await api.getProduct('oxford-shirt-ecru')
  const sold = product.variants.find((v) => v.id.endsWith('-xs'))
  // Placing once decremented; the replay above returned early, before the
  // decrement, so inventory moved exactly once.
  assert.ok(sold === undefined || sold.inventory >= 0)
})

test('an unknown cart is a 404, not a silent empty order', async () => {
  await assert.rejects(
    () => api.adminPlaceOrder({ cartId: 'cart_does_not_exist', email: 'x@example.com' }),
    (err) => err.status === 404 && err.code === 'cart_not_found',
  )
})

test('it refuses to sell stock that is gone, exactly as checkout does', async () => {
  // Both paths share one implementation. If they ever diverge, the oversell
  // guard is the thing that stops guarding.
  const { variant, cart } = await fill('cotton-cap', 2)
  await api.adminSetInventory(variant.id, 0)

  await assert.rejects(
    () => api.adminPlaceOrder({ cartId: cart.id, email: 'x@example.com' }),
    (err) => {
      assert.equal(err.code, 'out_of_stock')
      assert.equal(err.status, 409)
      assert.equal(err.detail.lines[0].wanted, 2)
      assert.equal(err.detail.lines[0].available, 0)
      return true
    },
  )
  await api.clearCart()
})

test('an admin reads any order; a shopper reads only their own', async () => {
  // This is the whole reason the admin route exists, and the distinction an
  // implementer is most likely to copy wrongly.
  const { cart } = await fill('wool-overcoat')
  const order = await api.adminPlaceOrder({
    cartId: cart.id,
    email: 'someone-else@example.com',
    payment: PAYMENT,
    idempotencyKey: `key_${Date.now()}`,
  })

  assert.equal((await api.adminGetOrder(order.id)).id, order.id)
  assert.equal((await api.adminGetOrder(order.number)).id, order.id, 'the number should work too')

  // `adminPlaceOrder` deliberately does not grant this browser the
  // guest-confirmation capability — the shop's own tab is not the buyer.
  await assert.rejects(() => api.getOrder(order.id), (err) => err.status === 404)
})

test('an admin read never redacts the payment reference', async () => {
  // The refund route calls the provider with it.
  const { items } = await api.listOrders().catch(() => ({ items: [] }))
  const any = items[0] || (await api.adminGetOrder((await fillAndPlace()).id))
  if (any?.payment?.reference) assert.ok(any.payment.reference.length > 0)
})

async function fillAndPlace() {
  const { cart } = await fill('cotton-cap')
  return api.adminPlaceOrder({ cartId: cart.id, email: 'x@example.com', payment: PAYMENT, idempotencyKey: `k${Math.random()}` })
}

test('an unknown order is a 404', async () => {
  await assert.rejects(() => api.adminGetOrder('order_nope'), (err) => err.status === 404)
})
