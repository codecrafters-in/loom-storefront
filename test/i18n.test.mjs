import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../test/helpers/browser.mjs'

// The helper's document is minimal; a browser's has <html> to carry lang and dir.
globalThis.document.documentElement ??= {}

const i18n = await import('../src/i18n/index.js')

test('English is the key: untranslated text shows as written', async () => {
  await i18n.setLanguage('en')
  assert.equal(i18n.t('Add to bag'), 'Add to bag')
  assert.equal(i18n.t('Add {amount} for free shipping', { amount: '$12.00' }), 'Add $12.00 for free shipping')
  assert.equal(i18n.plural(1, '{count} item', '{count} items'), '1 item')
  assert.equal(i18n.plural(3, '{count} item', '{count} items'), '3 items')
})

test('a language from the address loads its catalog, sets lang and direction, and is asked for', async () => {
  assert.equal(i18n.languageFromPath('/fr/shop/knits'), 'fr')
  assert.equal(i18n.languageFromPath('/shop'), '')
  assert.equal(i18n.languageFromPath('/xx/shop'), '')
  assert.equal(i18n.languageFromPath('/en/shop'), 'en', 'English has an address of its own on a store with another default')
  await i18n.setLanguage('ar', { address: true })
  assert.equal(i18n.currentLanguage(), 'ar')
  assert.equal(i18n.isRightToLeft(), true)
  assert.equal(i18n.languageFromAddress(), true)
  assert.equal(i18n.addressPrefix(), '/ar', 'payment return addresses keep the language')
  assert.equal(document.documentElement.dir, 'rtl')
  assert.equal(document.documentElement.lang, 'ar')
  await i18n.setLanguage('fr')
  assert.equal(document.documentElement.dir, 'ltr')
  assert.equal(i18n.languageFromAddress(), false)
  assert.equal(i18n.addressPrefix(), '')
})

test('merchant wording wins over the catalog, and plurals follow the language', async () => {
  await i18n.setLanguage('en')
  i18n.setOverrides({ 'Add to bag': 'Add to basket', '{count} items': { one: '{count} piece', other: '{count} pieces' } })
  assert.equal(i18n.t('Add to bag'), 'Add to basket')
  assert.equal(i18n.plural(1, '{count} item', '{count} items'), '1 piece')
  assert.equal(i18n.plural(4, '{count} item', '{count} items'), '4 pieces')
  i18n.setOverrides(null)
  assert.equal(i18n.t('Add to bag'), 'Add to bag')
})
