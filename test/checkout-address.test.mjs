import { test } from 'node:test'
import assert from 'node:assert/strict'
import './helpers/browser.mjs'

/* A bag with nothing to ship still asks the billing address Odoo asks for (website_sale `_needs_customer_address`). */

const { asksAddress, checkoutAddress } = await import('../src/lib/checkout.js')
const address = { name: 'Dee Gital', line1: '1 Main St', city: 'Omaha', region: 'NE', postalCode: '68102', country: 'US' }

test('a bag of services asks and sends the billing address', () => {
  const cart = { requiresShipping: false, requiresBillingAddress: true }
  assert.equal(asksAddress(cart), true)
  assert.deepEqual(checkoutAddress(cart, address), address)
})

test('only when Odoo asks none does a bag of services send just the name', () => {
  const cart = { requiresShipping: false, requiresBillingAddress: false }
  assert.equal(asksAddress(cart), false)
  assert.deepEqual(checkoutAddress(cart, address), { name: 'Dee Gital' })
})

test('a bag with something to ship always asks the address', () => {
  assert.equal(asksAddress({ requiresShipping: true, requiresBillingAddress: true }), true)
  assert.equal(asksAddress({}), true)
})
