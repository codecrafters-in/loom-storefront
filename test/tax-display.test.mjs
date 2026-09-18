import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shared } from './helpers/browser.mjs'

/*
 * The rows under a bag, an order and the checkout summary: exactly Odoo's cart summary (`website_sale.total`), in
 * either of its Display Product Prices modes. Delivery as the store shows prices, then Subtotal (untaxed, delivery
 * included), Taxes and the total. Discounts, gift wrapping and a cash-on-delivery fee come first, as Odoo lists them
 * among the lines.
 */

const { totalRows } = await import('../src/lib/totals.js')

const gbp = (amount) => ({ amount, currency: 'GBP' })
const rows = (bag, fee) => totalRows(bag, fee).map((row) => [row.label, (row.off ? -1 : 1) * row.money.amount])

// One £29.99 product with 20% VAT included, Royal Mail £2.99 with VAT included: Odoo's /shop/cart.
const uk = { subtotal: gbp(2999), untaxed: gbp(2748), tax: gbp(550), total: gbp(3298), discount: gbp(0), fee: gbp(0), giftWrap: gbp(0) }

test('a tax-included store: Delivery with tax, Subtotal untaxed, Taxes, as Odoo prints them', () => {
  assert.deepEqual(rows({ ...uk, taxIncluded: true, shipping: gbp(299) }), [['Delivery', 299], ['Subtotal', 2748], ['Taxes', 550]])
})

test('a tax-excluded store: the same rows, Delivery without tax', () => {
  assert.deepEqual(rows({ ...uk, taxIncluded: false, shipping: gbp(249) }), [['Delivery', 249], ['Subtotal', 2748], ['Taxes', 550]])
})

test('codes, promotions, gift wrapping and a cash-on-delivery fee come before Odoo\'s rows', () => {
  const bag = {
    ...uk,
    shipping: gbp(299),
    codes: [{ code: 'TEST10', label: '10% off', amount: gbp(300) }, { code: 'NONE', amount: gbp(0) }],
    promotions: [{ name: 'Summer', amount: gbp(100) }],
    giftWrap: gbp(299),
  }
  assert.deepEqual(rows(bag, gbp(149)).map(([label]) => label),
    ['10% off', 'Summer', 'Gift wrapping', 'Cash on delivery fee', 'Delivery', 'Subtotal', 'Taxes'])
  assert.deepEqual(rows(bag)[0], ['10% off', -300])
})

test('an older answer: one discount, no untaxed amount, nothing to deliver', () => {
  const bag = { subtotal: gbp(5000), discount: gbp(500), discountCode: { label: 'WELCOME' }, shipping: gbp(0), tax: gbp(360), total: gbp(4860), requiresShipping: false }
  assert.deepEqual(rows(bag), [['WELCOME', -500], ['Subtotal', 4500], ['Taxes', 360]])
  assert.equal(rows({ ...bag, discountCode: null })[0][0], 'Discount')
})

test('the bag’s fiscal position travels with every later call', async () => {
  globalThis.window.location.origin = 'http://localhost'
  shared.clear()
  const http = await import('../src/lib/api/http.js')
  const seen = []
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url)
    seen.push(init.headers?.['x-loom-fiscal-position'])
    const answer = pathname === '/carts/bag'
      ? { id: 'bag', lines: [], subtotal: gbp(0), total: gbp(0), fiscalPositionId: shared.get('next') || '0' }
      : { items: [], total: 0 }
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  shared.set('loom.cart_id', 'bag')
  await http.getCart()
  await http.listProducts({})
  assert.equal(seen.at(-1), '0', 'a bag with none says so')
  shared.set('next', '12')
  await http.getCart()
  await http.listProducts({})
  assert.equal(seen.at(-1), '12', 'an export address made the bag tax-free: the catalogue follows')
})

test('the bag’s pricelist prices the catalogue, over the currency picked before it', async () => {
  globalThis.window.location.origin = 'http://localhost'
  shared.clear()
  const http = await import('../src/lib/api/http.js')
  const { choosePricelist } = await import('../src/lib/pricelist.js')
  const seen = []
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url)
    seen.push(init.headers?.['x-loom-pricelist'])
    const answer = pathname === '/carts/bag'
      ? { id: 'bag', lines: [], subtotal: gbp(0), total: gbp(0), pricelistId: shared.get('next') || null }
      : { items: [], total: 0 }
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  choosePricelist('3')
  shared.set('loom.cart_id', 'bag')
  await http.getCart()
  await http.listProducts({})
  assert.equal(seen.at(-1), '3', 'no bag pricelist yet: the switcher’s choice')
  shared.set('next', '7.5ab1')
  await http.getCart()
  await http.listProducts({})
  assert.equal(seen.at(-1), '7.5ab1', 'a code moved the bag to another pricelist: the catalogue follows')
  choosePricelist('4')
  await http.listProducts({})
  assert.equal(seen.at(-1), '4', 'a new pick counts until the bag answers')
})
