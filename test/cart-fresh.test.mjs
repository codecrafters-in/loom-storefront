import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shared } from './helpers/browser.mjs'

/*
 * Once a bag becomes an order, the next `POST /carts` must say `fresh: true`.
 * Without it a signed-in customer's older open bag came back as "your bag",
 * holding items that looked already bought.
 */

globalThis.window.location.origin = 'http://localhost'
const http = await import('../src/lib/api/http.js')

const money = { amount: 0, currency: 'USD' }
const cartBody = (id) => ({ id, lines: [], subtotal: money, total: money })

/** Answer the adapter's requests from `routes`, and record what it sent. */
function serve(routes) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url)
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method: init.method, path: pathname, body })
    const answer = routes(init.method, pathname, body)
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return calls
}

test('a payment that became an order makes the next bag a fresh one', async () => {
  shared.clear()
  shared.set('loom.cart_id', 'paid-bag')
  const calls = serve((method, path) => {
    if (path === '/payments/pay-1') return { id: 'pay-1', status: 'paid', order: { id: 'order-token', number: 'S00012' } }
    if (method === 'POST' && path === '/carts') return cartBody('new-bag')
    throw new Error(`unexpected ${method} ${path}`)
  })

  await http.getPayment('pay-1')
  assert.equal(shared.get('loom.cart_id') ?? null, null, 'the spent bag is forgotten')

  const cart = await http.getCart()
  assert.equal(cart.id, 'new-bag')
  assert.deepEqual(calls.find((c) => c.method === 'POST' && c.path === '/carts').body, { fresh: true })
  assert.equal(shared.get('loom.cart_fresh') ?? null, null, 'only the first bag after an order is forced fresh')
})

test('a payment still in progress keeps the bag', async () => {
  shared.clear()
  shared.set('loom.cart_id', 'bag')
  serve(() => ({ id: 'pay-2', status: 'pending', order: null }))

  await http.getPayment('pay-2')
  assert.equal(shared.get('loom.cart_id'), 'bag')
  assert.equal(shared.get('loom.cart_fresh') ?? null, null)
})

test('a first visit does not force a new bag, so signing in on a new device restores it', async () => {
  shared.clear()
  const calls = serve(() => cartBody('restored'))

  const cart = await http.getCart()
  assert.equal(cart.id, 'restored')
  assert.deepEqual(calls[0].body, {})
})
