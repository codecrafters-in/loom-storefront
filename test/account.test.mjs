import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api } = await loadApp()
const email = 'first@example.com'
let orderId

test('a visitor is not signed in', async () => {
  await assert.rejects(() => api.getMe())
})

test('register, then read yourself back', async () => {
  const { customer } = await api.register({ email, password: 'secret123', firstName: 'Ada' })
  assert.equal(customer.email, email)
  assert.equal((await api.getMe()).email, email)
})

test('profile and addresses persist', async () => {
  const updated = await api.updateMe({ firstName: 'Adaline' })
  assert.equal(updated.firstName ?? updated.customer?.firstName, 'Adaline')

  const saved = await api.saveAddress({ name: 'Ada', line1: '1 Mill St', city: 'Erode', postalCode: '638001', country: 'IN' })
  const addresses = saved.addresses || saved.customer?.addresses || []
  assert.equal(addresses.length, 1)
})

test('buying puts an order in your history', async () => {
  const product = await api.getProduct('oxford-shirt-ecru')
  const variant = product.variants.find((v) => v.available)
  const cart = await api.addToCart({ variantId: variant.id, quantity: 1 })
  assert.equal(cart.lines.length, 1)

  const order = await api.checkout({
    email,
    shippingAddress: { name: 'Ada', line1: '1 Mill St', city: 'Erode', postalCode: '638001', country: 'IN' },
    shippingMethod: 'standard',
  })
  orderId = (order.order || order).id

  const { items } = await api.listOrders()
  assert.ok(items.some((o) => o.id === orderId))
  assert.equal((await api.getOrder(orderId)).id, orderId)
})

test('checkout empties the bag', async () => {
  assert.equal((await api.getCart()).lines.length, 0)
})

test('signing out closes the order history', async () => {
  // It used to hand back every order in the browser regardless of session, so
  // signing out and reloading still showed the last person's purchases.
  await api.logout()
  await assert.rejects(() => api.getMe())
  await assert.rejects(() => api.listOrders(), (err) => err.code === 'unauthenticated')
  await assert.rejects(() => api.listPaymentMethods(), (err) => err.status === 401)
})

test('a guest can still open the confirmation for the order they just placed', async () => {
  // Bouncing somebody off their own confirmation page to a sign-in form is the
  // worst possible moment to ask for a password.
  assert.equal((await api.getOrder(orderId)).id, orderId)
})

test('the next person on this browser cannot see the last one\'s order', async () => {
  await api.login({ email: 'second@example.com', password: 'secret123' })
  const { items } = await api.listOrders()
  assert.ok(!items.some((o) => o.id === orderId), 'an order leaked between accounts')
  // 404 rather than 403: "not allowed" confirms the order exists.
  await assert.rejects(() => api.getOrder(orderId), (err) => err.status === 404)
})

test('signing in seeds a history so the Orders tab is not empty', async () => {
  const { items } = await api.listOrders()
  assert.ok(items.length >= 2)
  assert.ok(items.some((o) => o.status === 'fulfilled' && o.tracking))
  assert.ok(items.some((o) => o.status === 'delivered'))
})

test('credentials are still checked', async () => {
  await assert.rejects(() => api.login({ email: 'x@example.com', password: 'no' }),
    (err) => err.code === 'invalid_credentials')
  await assert.rejects(() => api.login({ email: '', password: '' }),
    (err) => err.code === 'missing_credentials')
})
