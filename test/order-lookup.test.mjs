import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp, shared } from './helpers/browser.mjs'

const { api } = await loadApp()

const buy = async () => {
  const product = await api.getProduct('oxford-shirt-ecru')
  const variant = product.variants.find((v) => v.available)
  await api.addToCart({ variantId: variant.id, quantity: 1 })
  return api.checkout({
    email: 'Guest@Example.com',
    shippingAddress: { name: 'A Guest', line1: '1 Mill St', city: 'Erode', postalCode: '638001', country: 'IN' },
    shippingMethod: 'standard',
  })
}

const order = await buy()

test('an order is found by its number and email', async () => {
  const found = await api.lookupOrder({ number: order.number, email: 'Guest@Example.com' })
  assert.equal(found.id, order.id)
})

test('the match is case and whitespace insensitive', async () => {
  // Somebody typing their own order number off a phone screen should not be
  // defeated by a capital letter.
  const found = await api.lookupOrder({ number: `  ${order.number.toLowerCase()} `, email: '  GUEST@example.com  ' })
  assert.equal(found.id, order.id)
})

test('the order id works too, since that is what the link carries', async () => {
  const found = await api.lookupOrder({ number: order.id, email: 'guest@example.com' })
  assert.equal(found.id, order.id)
})

test('the right number with the wrong email is refused', async () => {
  await assert.rejects(() => api.lookupOrder({ number: order.number, email: 'someone@else.com' }),
    (err) => err.status === 404)
})

test('a wrong number and a wrong email fail identically', async () => {
  // A distinct "that order exists but the email does not match" turns this into
  // an oracle for which order numbers are real.
  const wrongEmail = await api.lookupOrder({ number: order.number, email: 'x@y.com' }).catch((e) => e)
  const wrongNumber = await api.lookupOrder({ number: 'LM-99999', email: 'guest@example.com' }).catch((e) => e)
  assert.equal(wrongEmail.status, wrongNumber.status)
  assert.equal(wrongEmail.code, wrongNumber.code)
  assert.equal(wrongEmail.message, wrongNumber.message)
})

test('one field on its own is not a lookup', async () => {
  for (const body of [{ number: order.number }, { email: 'guest@example.com' }, {}]) {
    await assert.rejects(() => api.lookupOrder(body), (err) => err.code === 'missing_fields')
  }
})

test('a successful lookup makes the confirmation page reachable', async () => {
  // Which is what somebody looking their order up actually wanted.
  shared.delete('loom.placed')
  await assert.rejects(() => api.getOrder(order.id), (err) => err.status === 404)

  await api.lookupOrder({ number: order.number, email: 'guest@example.com' })
  assert.equal((await api.getOrder(order.id)).id, order.id)
})

test('it does not open somebody else\'s order once signed in', async () => {
  // A signed-in session is an assertion of identity and has to be the one that
  // decides, or the second person on a shared laptop reads the first one's.
  await api.login({ email: 'other@example.com', password: 'secret123' })
  await assert.rejects(() => api.getOrder(order.id), (err) => err.status === 404)
  await api.logout()
})
