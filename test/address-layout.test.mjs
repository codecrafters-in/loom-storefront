import { test } from 'node:test'
import assert from 'node:assert/strict'

const { addressLayout, postcodeLabel } = await import('../src/lib/addressLayout.js')

test('without a layout from the backend the form is the one it always was', () => {
  const layout = addressLayout(null)
  assert.deepEqual(layout.short, ['city', 'region', 'postalCode', 'country'])
  assert.equal(layout.postcodeRequired, true)
  assert.equal(postcodeLabel(layout), 'Postcode')
  assert.equal(layout.labels.region, 'State / region')
})

test('a country whose layout has no postcode gets no postcode box', () => {
  const layout = addressLayout({ code: 'XX', fields: ['line1', 'city', 'country'], zipRequired: false })
  assert.equal(layout.showPostcode, false)
  assert.deepEqual(layout.short, ['city', 'country'])
})

test('Kuwait: the postcode is there but optional', () => {
  const layout = addressLayout({ code: 'KW', fields: ['line1', 'line2', 'city', 'region', 'postalCode', 'country'], zipRequired: false })
  assert.equal(layout.showPostcode, true)
  assert.equal(layout.postcodeRequired, false)
  assert.equal(postcodeLabel(layout), 'Postcode (optional)')
})

test('the country\'s own order and words', () => {
  const layout = addressLayout({
    code: 'JP', fields: ['postalCode', 'region', 'city', 'line1', 'line2', 'country'], zipRequired: true,
    labels: { region: 'Prefecture', postalCode: 'Postcode' },
  })
  assert.deepEqual(layout.short, ['postalCode', 'region', 'city', 'country'])
  assert.equal(layout.labels.region, 'Prefecture')
  const india = addressLayout({ code: 'IN', fields: ['line1', 'city', 'region', 'postalCode', 'country'], zipRequired: true, labels: { region: 'State', postalCode: 'PIN code' } })
  assert.equal(postcodeLabel(india), 'PIN code')
})

test('a required postcode the layout leaves out still gets a box, before the country', () => {
  const layout = addressLayout({ code: 'YY', fields: ['line1', 'city', 'country'], zipRequired: true })
  assert.deepEqual(layout.short, ['city', 'postalCode', 'country'])
  assert.equal(layout.postcodeRequired, true)
})
