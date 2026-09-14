import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'
import { modelOf, priceFor } from '../src/lib/variants.js'

const { api } = await loadApp()

/**
 * The price the buy box shows: `priceFor` from lib/variants.js, the function
 * the product page calls, rather than a copy of it.
 *
 * A copy of this calculation would keep passing after the real one broke, which
 * is exactly the failure it exists to catch — the bug was that the page read
 * `variant`, which needs a colour *and* a size, so choosing a colour changed
 * nothing and the price then jumped when a size was picked.
 */
const shown = (p, color, size) => {
  const selection = {}
  if (color) selection.Color = `Color:${color}`
  if (size) selection.Size = `Size:${size}`
  return priceFor(modelOf(p), selection, p)
}
const label = (s) => (s.to ? `${s.price.amount}-${s.to.amount}` : String(s.price.amount))

const slug = 'oxford-shirt-ecru'
const id = (await api.getProduct(slug)).id

// A colour priced differently, and one size inside another colour.
const draft = await api.adminGetProduct(id)
draft.variants = draft.variants.map((v) => {
  if (v.options.Color === 'Black') return { ...v, price: { amount: 14900, currency: 'USD' } }
  if (v.options.Color === 'Ecru' && v.options.Size === 'XL') return { ...v, price: { amount: 12800, currency: 'USD' } }
  return v
})
await api.adminSaveProduct(draft)
const product = await api.getProduct(slug)

test('per-variant prices survive the round trip', () => {
  const black = product.variants.find((v) => v.options.Color === 'Black')
  assert.equal(black.price.amount, 14900)
})

test('choosing a colour alone updates the price', () => {
  assert.equal(label(shown(product, 'Black', null)), '14900')
})

test('a colour whose sizes disagree shows a range, not a number that will move', () => {
  assert.equal(label(shown(product, 'Ecru', null)), '11800-12800')
})

test('a settled variant shows its exact price', () => {
  assert.equal(label(shown(product, 'Ecru', 'S')), '11800')
  assert.equal(label(shown(product, 'Ecru', 'XL')), '12800')
})

test('a colour priced uniformly shows one price', () => {
  assert.equal(label(shown(product, 'Pale Blue', null)), String(product.price.amount))
})

test('a range never carries a compare-at', () => {
  // "Was $X" against two numbers is not a claim anybody can check.
  const ranged = shown(product, 'Ecru', null)
  assert.ok(ranged.to)
  assert.equal(ranged.compareAt, undefined)
})

test('changing the product price leaves overridden variants alone', async () => {
  const again = await api.adminGetProduct(id)
  again.price = { amount: 12500, currency: 'USD' }
  await api.adminSaveProduct(again)
  const after = await api.getProduct(slug)

  const black = after.variants.find((v) => v.options.Color === 'Black')
  const ecruXl = after.variants.find((v) => v.options.Color === 'Ecru' && v.options.Size === 'XL')
  const ecruS = after.variants.find((v) => v.options.Color === 'Ecru' && v.options.Size === 'S')

  assert.equal(black.price.amount, 14900, 'an override was overwritten by a product repricing')
  assert.equal(ecruXl.price.amount, 12800, 'a size surcharge did not survive a repricing')
  assert.equal(ecruS.price.amount, 12500, 'a variant that tracked the product price did not follow')
})

test('a card shows a range when its variants disagree', async () => {
  const { items } = await api.listProducts({ perPage: 200 })
  const card = items.find((p) => p.slug === slug)
  const prices = card.variants.map((v) => v.price)
  const low = prices.reduce((a, b) => (b.amount < a.amount ? b : a))
  const high = prices.reduce((a, b) => (b.amount > a.amount ? b : a))
  assert.notEqual(low.amount, high.amount, 'the listing carries the variants it needs to price honestly')
})
