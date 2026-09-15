import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../test/helpers/browser.mjs'

const { displayLocale, formatMoney, registerLocale, taxNote } = await import('../src/lib/money.js')

/*
 * Prices in the store's locale (`pricing.locale`), and its tax note.
 *
 * Prices were formatted in the build's locale, so a German store showed "€1,234.50" whatever it chose in Odoo.
 */

test("prices follow the store's locale once the settings register it", () => {
  const eur = { amount: 123450, currency: 'EUR' }
  assert.equal(displayLocale(), 'en-US', 'before the settings arrive: the build locale')
  assert.equal(formatMoney(eur), '€1,234.50')
  registerLocale('de-DE')
  assert.equal(displayLocale(), 'de-DE')
  assert.match(formatMoney(eur), /^1\.234,50\s€$/)
  registerLocale('fr_FR')
  assert.equal(displayLocale(), 'fr-FR', "Odoo's spelling is accepted")
  registerLocale('not a locale!')
  registerLocale('')
  assert.equal(displayLocale(), 'fr-FR', 'nonsense and nothing keep the locale there was')
  assert.match(formatMoney(eur, { locale: 'en-IN' }), /1,234\.50/, 'a locale passed in still wins')
  registerLocale('en-US')
})

test('the tax note shows only when the store turned it on and wrote one', () => {
  assert.equal(taxNote({ showTaxNote: true, taxNote: ' Prices include VAT. ' }), 'Prices include VAT.')
  assert.equal(taxNote({ showTaxNote: false, taxNote: 'Prices include VAT.' }), '')
  assert.equal(taxNote({ showTaxNote: true, taxNote: '' }), '')
  assert.equal(taxNote(undefined), '')
})
