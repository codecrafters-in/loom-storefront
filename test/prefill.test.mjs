import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefillCheckout, defaultAddressOf, storeCountry } from '../src/lib/prefill.js'

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

test('a saved address in a country the store does not deliver to is left out', () => {
  const indian = { email: 'shopper@example.com', addresses: [{ id: 1, isDefault: true, name: 'Asha', line1: '12 MG Road', city: 'Ahmedabad', region: 'GJ', postalCode: '380054', country: 'IN' }] }
  const form = prefillCheckout({ ...EMPTY, country: 'GB' }, indian, new Set(), ['GB'])
  assert.equal(form.country, 'GB', 'the store\'s own country stays')
  assert.equal(form.region, '', 'no Indian state under the United Kingdom')
  assert.equal(form.line1, '')
  assert.equal(form.email, 'shopper@example.com', 'the email is still filled')
  const both = { ...indian, addresses: [...indian.addresses, { id: 2, name: 'Asha', line1: '1 High St', city: 'London', postalCode: 'E1 6JE', country: 'GB' }] }
  assert.equal(prefillCheckout({ ...EMPTY, country: 'GB' }, both, new Set(), ['GB']).line1, '1 High St', 'a deliverable saved address is used')
})

test("the store's own country is its locale's when it delivers there, else the first it lists", () => {
  const countries = [['IE', 'Ireland'], ['GB', 'United Kingdom']]
  assert.equal(storeCountry({ pricing: { locale: 'en-GB' }, commerce: { countries } }), 'GB')
  assert.equal(storeCountry({ pricing: { locale: 'en-US' }, commerce: { countries } }), 'IE', 'never a country it does not list')
  assert.equal(storeCountry({ pricing: { locale: 'en-GB' } }), '', 'nothing to ask with no countries')
})

test('every country is offered for billing, the store\'s own names first choice', async () => {
  const { allCountries } = await import('../src/lib/countries.js')
  const list = allCountries('en', [['GB', 'Great Britain']])
  assert.ok(list.length > 240)
  assert.deepEqual(list.find(([code]) => code === 'GB'), ['GB', 'Great Britain'])
  assert.deepEqual(list.find(([code]) => code === 'JP'), ['JP', 'Japan'])
  assert.equal(allCountries(undefined).length, list.length)
})
