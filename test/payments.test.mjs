import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api } = await loadApp()

const buy = async (slug, quantity = 1) => {
  const product = await api.getProduct(slug)
  const variant = product.variants.find((v) => v.inventory >= quantity)
  await api.addToCart({ variantId: variant.id, quantity })
  return variant
}

const place = (email = 'buyer@example.com') =>
  api.checkout({
    email,
    shippingAddress: { name: 'A Buyer', line1: '1 Mill St', city: 'Erode', postalCode: '638001', country: 'IN' },
    shippingMethod: 'standard',
  })

/* ── overselling ───────────────────────────────────────────────────────── */

test('checkout refuses a line the catalogue can no longer cover', async () => {
  // Availability was last checked when the line was added, which may have been
  // yesterday. Without this, two shoppers who both add the last unit both get a
  // confirmed order and one gets an email nobody can fulfil.
  const variant = await buy('oxford-shirt-ecru', 1)
  await api.adminSetInventory(variant.id, 0)

  await assert.rejects(place(), (err) => {
    assert.equal(err.code, 'out_of_stock')
    assert.equal(err.status, 409)
    assert.equal(err.detail.lines[0].variantId, variant.id)
    return true
  })
})

test('a refused checkout leaves the bag intact', async () => {
  // Emptying it would lose the shopper the thing they were trying to buy.
  assert.equal((await api.getCart()).lines.length, 1)
  await api.clearCart()
})

test('it names the shortfall so the shopper can act on it', async () => {
  const variant = await buy('cotton-cap', 3)
  await api.adminSetInventory(variant.id, 1)
  await assert.rejects(place(), (err) => {
    assert.equal(err.detail.lines[0].wanted, 3)
    assert.equal(err.detail.lines[0].available, 1)
    return true
  })
  await api.clearCart()
})

/* ── the payment record ────────────────────────────────────────────────── */

let order

test('an order records what happened to the money, separately from the parcel', async () => {
  const variant = await buy('wool-overcoat', 1)
  await api.adminSetInventory(variant.id, 5)
  order = await place()

  // An order can be paid and unshipped, or shipped and refunded. Collapsing
  // the two into one field is how a refund looks like a delivery.
  assert.equal(order.status, 'placed')
  assert.equal(order.payment.status, 'captured')
  assert.equal(order.payment.amount.amount, order.total.amount)
  assert.deepEqual(order.refunds, [])
  assert.equal(order.refundedTotal.amount, 0)
})

/* ── refunds ───────────────────────────────────────────────────────────── */

test('a partial refund is recorded and does not close the order', async () => {
  const part = Math.round(order.total.amount / 4)
  const after = await api.adminRefundOrder(order.id, { amount: part, reason: 'Returned one item' })

  assert.equal(after.refunds.length, 1)
  assert.equal(after.refundedTotal.amount, part)
  assert.equal(after.payment.status, 'partially_refunded')
  assert.equal(after.status, 'placed', 'a partial refund is not a finished order')
  assert.equal(after.refunds[0].restocked, false, 'a partial refund cannot say which item came back')
})

test('a second refund adds to the first rather than replacing it', async () => {
  // A boolean cannot express "refunded twice, for two different reasons", and
  // a list is the only shape that reconciles against a provider's own records.
  const after = await api.adminRefundOrder(order.id, { amount: 100, reason: 'Postage' })
  assert.equal(after.refunds.length, 2)
  assert.equal(after.refundedTotal.amount, Math.round(order.total.amount / 4) + 100)
})

test('refunding more than is left is refused', async () => {
  await assert.rejects(() => api.adminRefundOrder(order.id, { amount: order.total.amount }),
    (err) => err.code === 'amount_too_large')
})

test('a zero or negative refund is refused', async () => {
  await assert.rejects(() => api.adminRefundOrder(order.id, { amount: 0 }), (err) => err.code === 'invalid_amount')
  await assert.rejects(() => api.adminRefundOrder(order.id, { amount: -500 }), (err) => err.code === 'invalid_amount')
})

test('refunding the rest closes the order and puts the stock back', async () => {
  const line = order.lines[0]
  const before = (await api.getProduct('wool-overcoat')).variants.find((v) => v.id === line.variantId).inventory

  const after = await api.adminRefundOrder(order.id, { reason: 'Returned' }) // no amount means the rest
  assert.equal(after.refundedTotal.amount, order.total.amount)
  assert.equal(after.status, 'refunded')
  assert.equal(after.payment.status, 'refunded')

  const now = (await api.getProduct('wool-overcoat')).variants.find((v) => v.id === line.variantId).inventory
  assert.equal(now, before + line.quantity, 'a full refund should return the units')
})

test('a fully refunded order cannot be refunded again', async () => {
  await assert.rejects(() => api.adminRefundOrder(order.id, { amount: 100 }),
    (err) => err.code === 'already_refunded')
})

test('refunding an order that does not exist is a 404', async () => {
  await assert.rejects(() => api.adminRefundOrder('order_nope', {}), (err) => err.status === 404)
})

/* ── credentials ───────────────────────────────────────────────────────── */

test('the demo says plainly that it stores no secrets', async () => {
  const credentials = await api.adminGetCredentials()
  assert.equal(credentials.storesSecrets, false)
  assert.ok(credentials.items.every((c) => c.set === false))
})

test('a secret is acknowledged but never kept', async () => {
  // A demo that accepts a live key is a demo that will eventually be handed
  // one. The marker is written; the value is dropped on the floor.
  const after = await api.adminSaveCredentials({ razorpayKeySecret: 'rzp_secret_do_not_keep_me' })
  const entry = after.items.find((c) => c.key === 'razorpayKeySecret')
  assert.equal(entry.set, true)
  assert.ok(entry.updatedAt)
  assert.equal(JSON.stringify(after).includes('do_not_keep_me'), false, 'the value came back out')
})

test('nothing anywhere in storage holds the value', async () => {
  const { shared } = await import('./helpers/browser.mjs')
  const everything = [...shared.values()].join(' ')
  assert.equal(everything.includes('do_not_keep_me'), false)
})

test('a secret is never served by the storefront read', async () => {
  // This is the whole reason for the separate path: getStorefront() is served
  // to every visitor.
  const config = JSON.stringify(await api.getStorefront())
  for (const key of ['razorpayKeySecret', 'smtpPassword', 'do_not_keep_me', 'password']) {
    assert.equal(config.includes(key), false, `${key} reached the public config`)
  }
})

test('clearing a secret removes the marker', async () => {
  const after = await api.adminSaveCredentials({ razorpayKeySecret: '' })
  assert.equal(after.items.find((c) => c.key === 'razorpayKeySecret').set, false)
})

test('an unknown credential is refused rather than silently stored', async () => {
  await assert.rejects(() => api.adminSaveCredentials({ mysteryKey: 'x' }),
    (err) => err.code === 'unknown_credential')
})

/* ── notifications ─────────────────────────────────────────────────────── */

test('a test email reports honestly that the browser cannot send one', async () => {
  const result = await api.adminSendTestNotification({ event: 'orderPlaced', to: 'me@example.com' })
  assert.equal(result.delivered, false)
  assert.equal(result.reason, 'no_server')
  assert.equal(result.preview.to, 'me@example.com')
  assert.ok(result.preview.subject, 'a preview should still show what would have been sent')
})

test('a misconfigured mail setup fails before it pretends to send', async () => {
  const config = await api.getStorefront()
  await api.adminUpdateSettings({ notifications: { ...config.notifications, from: '' } })
  await assert.rejects(() => api.adminSendTestNotification({}), (err) => err.code === 'missing_from')

  await api.adminUpdateSettings({ notifications: { ...config.notifications, enabled: false } })
  await assert.rejects(() => api.adminSendTestNotification({}), (err) => err.code === 'notifications_disabled')
})
