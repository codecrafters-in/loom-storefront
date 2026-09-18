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

test('checkout tells the store API the language the shopper browsed in', async () => {
  globalThis.window.location.origin = 'http://localhost'
  const { startCheckout } = await import('../src/lib/checkout.js')
  const i18n = await import('../src/i18n/index.js')
  await i18n.setLanguage('fr', { address: true })
  const sent = []
  globalThis.fetch = async (url, init) => {
    sent.push({ url, headers: init.headers })
    return new Response(JSON.stringify({ url: 'https://pay.example/x' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const config = { checkout: { mode: 'redirect', createUrl: '/carts/:cartId/checkout', successUrl: '/order/:orderId' } }
  await startCheckout({ config, cart: { id: 'c1' }, email: 'a@example.com', shippingAddress: address })
  assert.equal(sent[0].headers['x-loom-lang'], 'fr')

  await startCheckout({ config: { checkout: { ...config.checkout, createUrl: 'https://pay.example/session' } }, cart: { id: 'c1' } })
  assert.equal(sent[1].headers['x-loom-lang'], undefined, 'another service is not sent the header')
  await i18n.setLanguage('en')
})
