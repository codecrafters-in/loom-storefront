import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadApp } from './helpers/browser.mjs'

/**
 * Odoo settings the storefront follows (docs/API.md; the addon's docs/ODOO_PARITY.md).
 *
 * Node cannot import `.jsx`, so the components are read as source, as test/error-boundary.test.mjs does; what can run
 * (the adapters, the demo backend) runs.
 */
const read = (path) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const { api, root } = await loadApp()

test('a product priced on request shows Contact us, no price and no buy button', () => {
  const hook = read('hooks/useProductChoice.js')
  assert.match(hook, /priceOnRequest/)
  assert.match(hook, /ready: !blocker && !onRequest/, 'the bag must not take it')
  assert.match(read('components/ui/index.jsx'), /if \(!price\) return null/)
  const view = read('components/product/ProductView.jsx')
  assert.match(view, /choice\.onRequest \? \(\s*<ContactUs/)
  assert.match(view, /commerce\?\.contactUsUrl/)
  assert.match(read('components/product/ProductCard.jsx'), /!product\.priceOnRequest && span\.price/)
  assert.match(read('components/product/QuickView.jsx'), /<ContactUs/)
})

test('a shop for signed-in customers sends visitors to sign in', () => {
  const app = read('App.jsx')
  assert.match(app, /access\?\.shop !== 'logged_in'/)
  const gate = app.indexOf('<Route element={<ShopOnly />}>')
  assert.ok(gate > 0, 'no gate around the shop')
  for (const path of ['shop', 'product/:slug', 'search', 'cart', 'checkout']) {
    assert.ok(app.indexOf(`path="${path}"`) > gate, `${path} is outside the gate`)
  }
  assert.match(read('entry-server.jsx'), /err\.code === 'login_required'/)
})

test("the shop asks for Odoo's products per page and default sort unless the shopper chose", () => {
  const shop = read('pages/Shop.jsx')
  assert.match(shop, /sort: undefined,\n\s+page: 1,\n\s+perPage: undefined/)
  assert.match(shop, /config\.commerce\?\.shop\?\.sort/)
  assert.match(shop, /\['name', mark\('Name, A to Z'\)\]/)
})

test('the demo sorts by name too', async () => {
  const { items } = await api.listProducts({ sort: 'name', perPage: 50 })
  const titles = items.map((item) => item.title)
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)))
})

test("Odoo's ribbons, formatted descriptions, price per unit and documents are drawn", () => {
  const ui = read('components/ui/index.jsx')
  assert.match(ui, /export function Ribbon/)
  assert.match(ui, /background: ribbon\.bgColor, color: ribbon\.textColor/)
  assert.match(ui, /export function Rich/)
  const view = read('components/product/ProductView.jsx')
  assert.match(view, /product\.descriptionHtml/)
  assert.match(view, /product\.outOfStockMessage/)
  assert.match(view, /choice\.unit\.price/)
  assert.match(view, /product\.documents/)
  assert.match(read('pages/Product.jsx'), /product\.websiteDescription/)
  assert.match(read('pages/Shop.jsx'), /meta\?\.descriptionHtml/)
})

test("product views go to Odoo's visitor tracking, a guest's only with consent", async () => {
  const product = read('pages/Product.jsx')
  assert.match(product, /api\.recordView\(/)
  assert.match(product, /!consent \|\| consent\.analytics/)
  const http = await import(`${root}lib/api/http.js`)
  assert.equal(typeof http.recordView, 'function')
  assert.equal(await api.recordView('anything', {}), null, 'the demo keeps no visitors')
})
