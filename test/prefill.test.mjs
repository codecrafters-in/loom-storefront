import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefillCheckout, defaultAddressOf } from '../src/lib/prefill.js'

const EMPTY = { email: '', name: '', line1: '', line2: '', city: '', region: '', postalCode: '', country: 'US', phone: '' }

const customer = {
  id: '7',
  email: 'asha@example.com',
  addresses: [
    { id: '1', name: 'Asha Patel', line1: 'Old flat', city: 'Pune', region: 'MH', postalCode: '411001', country: 'IN', phone: '1', isDefault: false },
    { id: '2', name: 'Asha Patel', line1: '12 Ashram Road', line2: '', city: 'Ahmedabad', region: 'GJ', postalCode: '380009', country: 'IN', phone: '+91 98765 43210', isDefault: true },
  ],
}

test('a refreshed checkout fills the default address and email once the account arrives', () => {
  const form = prefillCheckout(EMPTY, customer)
  assert.equal(form.email, 'asha@example.com')
  assert.equal(form.line1, '12 Ashram Road')
  assert.equal(form.region, 'GJ')
  assert.equal(form.country, 'IN')
  assert.equal(form.phone, '+91 98765 43210')
})

test('without a default, the first saved address is used', () => {
  const noDefault = { ...customer, addresses: customer.addresses.map((a) => ({ ...a, isDefault: false })) }
  assert.equal(defaultAddressOf(noDefault).line1, 'Old flat')
})

test('what the shopper already typed is never overwritten', () => {
  const typed = { ...EMPTY, email: 'other@example.com', line1: 'Typed street' }
  const form = prefillCheckout(typed, customer, new Set(['email', 'line1']))
  assert.equal(form.email, 'other@example.com')
  assert.equal(form.line1, 'Typed street')
  assert.equal(form.city, '', 'a half-typed address is not mixed with a saved one')
})

test('a guest, or a customer with no saved address, keeps the form as it is', () => {
  assert.deepEqual(prefillCheckout(EMPTY, null), EMPTY)
  const form = prefillCheckout(EMPTY, { ...customer, addresses: [] })
  assert.equal(form.email, 'asha@example.com')
  assert.equal(form.country, 'US')
})
