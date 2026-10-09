import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadApp } from './helpers/browser.mjs'

/*
 * As Odoo's shop (website_sale_stock): asking for more than is left adds what is left, and the bag says so with a
 * warning instead of refusing the whole add.
 */
const { api } = await loadApp()

async function scarceVariant() {
  const listing = await api.listProducts({ perPage: 100 })
  for (const item of listing.items) {
    const product = await api.getProduct(item.slug)
    const variant = product.variants.find((v) => v.available && v.inventory > 0 && v.inventory < 50 && !product.combo)
    if (variant) return { product, variant }
  }
  throw new Error('no variant with a little stock in the demo')
}

test('more than is left adds what is left, with a warning', async () => {
  const { variant } = await scarceVariant()
  const cart = await api.addToCart({ variantId: variant.id, quantity: variant.inventory + 5 })
  const line = cart.lines.find((l) => l.variantId === variant.id)
  assert.equal(line.quantity, variant.inventory)
  assert.match(cart.warning, new RegExp(`only ${variant.inventory} is available`))

  const again = await api.updateCartLine(line.id, variant.inventory + 2)
  assert.equal(again.lines.find((l) => l.id === line.id).quantity, variant.inventory)
  assert.match(again.warning, /is available/)
  await api.removeCartLine(line.id)
})

test('the bag shows the warning instead of "Added"', () => {
  const source = fs.readFileSync(new URL('../src/store/CartContext.jsx', import.meta.url), 'utf8')
  assert.match(source, /if \(next\?\.warning\) push\(next\.warning/)
})
