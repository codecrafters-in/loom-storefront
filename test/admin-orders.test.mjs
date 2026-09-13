import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const { ORDER_VIEWS, adminOrderView, orderCounts, progressSteps, trackingProblem } = await import(`${root}lib/admin-orders.js`)

/*
 * Orders from the back office: list them, ship them with tracking, deliver
 * them, take the cash on delivery, cancel them. The demo adapter answers with
 * the same AdminOrder a real backend sends (docs/API.md), so the admin screens
 * behave identically against both.
 */

const address = {
  name: 'Asha Patel', line1: '12 Ashram Road', city: 'Ahmedabad', region: 'GJ',
  postalCode: '380009', country: 'IN', phone: '+91 98765 43210',
}
const details = { email: 'asha@example.com', shippingAddress: address, shippingMethod: 'standard' }

async function fill(slug) {
  const product = await api.getProduct(slug)
  const variant = product.variants.find((v) => v.inventory >= 1)
  await api.addToCart({ variantId: variant.id, quantity: 1 })
  return { cart: await api.getCart(), variant }
}

async function cardOrder(slug) {
  const { cart, variant } = await fill(slug)
  const card = (await api.getPaymentOptions(cart.id, details)).methods.find((m) => m.provider === 'demo')
  const created = await api.createPayment(cart.id, { ...details, providerId: card.providerId, methodId: card.methodId })
  const paid = await api.paymentAction(created.id, 'simulate', { outcome: 'done', cardNumber: '4242' })
  return { orderId: paid.order.id, variant }
}

async function cashOrder(slug) {
  const { cart, variant } = await fill(slug)
  const cod = (await api.getPaymentOptions(cart.id, details)).methods.find((m) => m.flow === 'offline')
  const created = await api.createPayment(cart.id, { ...details, providerId: cod.providerId, methodId: cod.methodId })
  return { orderId: created.order.id, variant }
}

test('a paid order waits to ship; shipping it with tracking reaches the shopper, then it is delivered', async () => {
  const { orderId } = await cardOrder('oxford-shirt-ecru')
  const view = await api.adminGetOrder(orderId)
  assert.equal(view.orderState, 'confirmed')
  assert.equal(view.paymentStatus, 'paid')
  assert.equal(view.delivery.status, 'to_ship')
  assert.equal(view.customer.name, 'Asha Patel')
  assert.deepEqual(view.actions, ['ship', 'deliver', 'cancel'])

  const shipped = await api.adminUpdateOrder(orderId, {
    action: 'ship',
    tracking: { carrier: 'Delhivery', code: 'AWB123', url: 'https://track.example/AWB123' },
  })
  assert.equal(shipped.delivery.status, 'shipped')
  assert.equal(shipped.delivery.trackingCode, 'AWB123')
  assert.ok(shipped.delivery.shippedAt)
  assert.deepEqual(shipped.actions, ['update_tracking', 'deliver'])

  const seen = await api.getOrder(orderId)
  assert.equal(seen.status, 'fulfilled', 'the shopper sees it on its way')
  assert.equal(seen.tracking.url, 'https://track.example/AWB123')

  const retracked = await api.adminUpdateOrder(orderId, { action: 'update_tracking', tracking: { code: 'AWB999' } })
  assert.equal(retracked.delivery.trackingCode, 'AWB999')
  assert.equal(retracked.delivery.carrier, 'Delhivery', 'a field left out is kept')

  const delivered = await api.adminUpdateOrder(orderId, { action: 'deliver' })
  assert.equal(delivered.delivery.status, 'delivered')
  assert.ok(delivered.delivery.deliveredAt)
  assert.deepEqual(delivered.actions, ['update_tracking'])
  assert.equal((await api.getOrder(orderId)).status, 'delivered')

  await assert.rejects(
    () => api.adminUpdateOrder(orderId, { action: 'cancel' }),
    (err) => err.status === 409 && err.code === 'action_not_allowed',
  )
})

test('cash on delivery ships first, and the cash is recorded when it is collected', async () => {
  const { orderId } = await cashOrder('wool-overcoat')
  const view = await api.adminGetOrder(orderId)
  assert.equal(view.orderState, 'quotation')
  assert.equal(view.paymentStatus, 'pending')
  assert.deepEqual(view.actions, ['ship', 'deliver', 'record_payment', 'cancel'])

  const shipped = await api.adminUpdateOrder(orderId, { action: 'ship' })
  assert.equal(shipped.orderState, 'confirmed')
  assert.equal(shipped.paymentStatus, 'pending')
  assert.ok(shipped.actions.includes('record_payment'))

  const paid = await api.adminUpdateOrder(orderId, { action: 'record_payment' })
  assert.equal(paid.paymentStatus, 'paid')
  assert.equal(paid.payment.status, 'captured')
  assert.ok(!paid.actions.includes('record_payment'))
})

test('cancelling before it ships puts the stock back, and a cancelled order takes no more actions', async () => {
  const { orderId, variant } = await cardOrder('merino-beanie')
  const stock = async () => (await api.getProduct('merino-beanie')).variants.find((v) => v.id === variant.id).inventory
  const before = await stock()

  const cancelled = await api.adminUpdateOrder(orderId, { action: 'cancel' })
  assert.equal(cancelled.orderState, 'cancelled')
  assert.equal(cancelled.delivery.status, 'cancelled')
  assert.deepEqual(cancelled.actions, [])
  assert.equal(await stock(), before + 1)

  await assert.rejects(
    () => api.adminUpdateOrder(orderId, { action: 'ship' }),
    (err) => err.status === 409 && err.code === 'action_not_allowed',
  )
})

test('the old status body still works, and bad input is refused clearly', async () => {
  const { orderId } = await cardOrder('oxford-shirt-ecru')
  const shipped = await api.adminUpdateOrder(orderId, { status: 'fulfilled' })
  assert.equal(shipped.delivery.status, 'shipped')

  await assert.rejects(
    () => api.adminUpdateOrder(orderId, { action: 'teleport' }),
    (err) => err.status === 422 && err.code === 'invalid_action',
  )
  await assert.rejects(
    () => api.adminUpdateOrder(orderId, { action: 'update_tracking', tracking: { url: 'track.example/1' } }),
    (err) => err.status === 422 && err.code === 'invalid_tracking',
  )
  await assert.rejects(() => api.adminUpdateOrder('order_nope', { action: 'ship' }), (err) => err.status === 404)
})

test('the list filters, searches, pages and counts every order', async () => {
  const { orderId } = await cashOrder('cotton-cap')
  const all = await api.adminListOrders({ perPage: 100 })
  assert.equal(all.total, all.items.length)
  assert.deepEqual(all.counts, orderCounts(all.items), 'counts cover every order')
  assert.ok(all.items.every((o, i) => i === 0 || all.items[i - 1].placedAt >= o.placedAt), 'newest first')

  const toShip = await api.adminListOrders({ delivery: 'to_ship', perPage: 100 })
  assert.ok(toShip.items.every((o) => o.delivery.status === 'to_ship'))
  assert.equal(toShip.total, all.counts.toShip)
  assert.deepEqual(toShip.counts, all.counts, 'a filter does not change the tab counts')

  const awaiting = await api.adminListOrders({ payment: 'awaiting', perPage: 100 })
  assert.ok(awaiting.items.some((o) => o.id === orderId), 'a Cash on Delivery order waits for its money')
  assert.ok(awaiting.items.every((o) => ['pending', 'unpaid'].includes(o.paymentStatus) && o.orderState !== 'cancelled'))

  // The number on each tab is the total of the list behind it — a count once
  // promised an order its list did not show.
  for (const view of ORDER_VIEWS.filter((v) => v.count)) {
    const list = await api.adminListOrders({ ...view.query, perPage: 100 })
    assert.equal(list.total, all.counts[view.count], `${view.label} count matches its list`)
  }

  const { number } = await api.adminGetOrder(orderId)
  const found = await api.adminListOrders({ q: number })
  assert.ok(found.items.some((o) => o.id === orderId))

  const first = await api.adminListOrders({ perPage: 1 })
  assert.equal(first.items.length, 1)
  assert.equal(first.perPage, 1)
  assert.ok((await api.adminListOrders({ perPage: 5000 })).perPage <= 100)
})

test('progress steps and tracking rules read the same for every adapter', () => {
  const view = adminOrderView({
    id: 'o', number: 'LM-1', status: 'fulfilled', placedAt: '2026-01-01T00:00:00Z',
    lines: [{ quantity: 1 }], email: 'a@example.com', tracking: 'LM884', payment: null,
  })
  assert.equal(view.delivery.trackingCode, 'LM884', 'a bare tracking string still reads')
  assert.deepEqual(progressSteps(view).map((s) => s.done), [true, true, true, false])
  assert.equal(trackingProblem({ url: 'ftp://example.com' }), 'The tracking link must start with http:// or https://.')
  assert.equal(trackingProblem({ carrier: 'DHL' }), null)
})
