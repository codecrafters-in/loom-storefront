import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shared } from './helpers/browser.mjs'

/*
 * Guest saved items, merged on sign-in; save for later; and the checkout extras (delivery instructions, gift
 * message and wrapping, terms) reaching the API under the names docs/API.md gives them.
 */

globalThis.window.location.origin = 'http://localhost'
const http = await import('../src/lib/api/http.js')

const money = { amount: 0, currency: 'USD' }
const cartBody = (id, lines = []) => ({ id, lines, subtotal: money, total: money })
const product = (slug) => ({ slug, title: slug })

function serve(routes) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url)
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ method: init.method || 'GET', path: pathname, query: Object.fromEntries(searchParams), body, auth: init.headers?.authorization })
    const answer = routes(init.method || 'GET', pathname, body, searchParams)
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return calls
}

test('a guest saves items in this browser and sees them in the order saved', async () => {
  shared.clear()
  const calls = serve((method, path, _body, query) => {
    if (path === '/products') return { items: query.get('slugs').split(',').reverse().filter((s) => s !== 'gone').map(product), total: 2 }
    throw new Error(`unexpected ${method} ${path}`)
  })

  assert.deepEqual(await http.getWishlist(), { items: [], total: 0 }, 'nothing saved asks nothing')
  assert.equal(calls.length, 0)

  await http.addToWishlist('gone')
  await http.addToWishlist('scarf')
  await http.addToWishlist('coat')
  await http.addToWishlist('scarf')
  assert.deepEqual(JSON.parse(shared.get('loom.wishlist')), ['scarf', 'coat', 'gone'], 'newest first, once each')

  const list = await http.getWishlist()
  assert.deepEqual(list.items.map((p) => p.slug), ['scarf', 'coat'], 'a product no longer sold drops out')
  assert.equal(calls[0].query.slugs, 'scarf,coat,gone')

  await http.removeFromWishlist('coat')
  await http.removeFromWishlist('gone')
  await http.removeFromWishlist('scarf')
  assert.equal(shared.get('loom.wishlist') ?? null, null)
})

test('signing in merges what a guest saved, once', async () => {
  shared.clear()
  shared.set('loom.wishlist', JSON.stringify(['scarf', 'coat']))
  const calls = serve((method, path) => {
    if (path === '/auth/login') return { token: 'tok', customer: { id: 7 } }
    if (path === '/me/wishlist/merge') return { ok: true, slugs: ['scarf', 'coat'] }
    throw new Error(`unexpected ${method} ${path}`)
  })

  const res = await http.login({ email: 'a@example.com', password: 'secret123' })
  assert.equal(res.customer.id, 7)
  const merge = calls.find((c) => c.path === '/me/wishlist/merge')
  assert.deepEqual(merge.body, { product_slugs: ['scarf', 'coat'] })
  assert.match(merge.auth || '', /tok/, 'sent as the customer who just signed in')
  assert.equal(shared.get('loom.wishlist') ?? null, null, 'merged items are no longer kept as a guest')

  calls.length = 0
  await http.login({ email: 'a@example.com', password: 'secret123' })
  assert.equal(calls.filter((c) => c.path === '/me/wishlist/merge').length, 0)
})

test('save for later: one request when signed in, saved locally and removed as a guest', async () => {
  shared.clear()
  shared.set('loom.cart_id', 'bag')
  shared.set('loom.session', JSON.stringify({ token: 'tok' }))
  let calls = serve((method, path) => {
    if (method === 'GET' && path === '/carts/bag') return cartBody('bag', [{ id: 5 }])
    if (method === 'POST' && path === '/carts/bag/lines/5/save') return cartBody('bag')
    throw new Error(`unexpected ${method} ${path}`)
  })
  const cart = await http.saveForLater(5, 'scarf')
  assert.deepEqual(cart.lines, [])
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1)

  shared.delete('loom.session')
  calls = serve((method, path) => {
    if (method === 'GET' && path === '/carts/bag') return cartBody('bag', [{ id: 5 }])
    if (method === 'DELETE' && path === '/carts/bag/lines/5') return cartBody('bag')
    throw new Error(`unexpected ${method} ${path}`)
  })
  await http.saveForLater(5, 'scarf')
  assert.deepEqual(JSON.parse(shared.get('loom.wishlist')), ['scarf'])
  assert.ok(calls.some((c) => c.method === 'DELETE'))
})

test('checkout extras travel with the payment request', async () => {
  shared.clear()
  const calls = serve(() => ({ id: 'pay-1', status: 'pending', order: null }))
  await http.createPayment('bag', {
    email: 'a@example.com', note: 'Ring twice', giftMessage: 'Happy birthday', giftWrap: true, acceptTerms: true,
  })
  const body = calls[0].body
  assert.equal(body.note, 'Ring twice')
  assert.equal(body.gift_message, 'Happy birthday')
  assert.equal(body.gift_wrap, true)
  assert.equal(body.accept_terms, true)
})

test('delivery slots and shops to collect from use the documented routes', async () => {
  shared.clear()
  shared.set('loom.cart_id', 'bag')
  const calls = serve((method, path) => {
    if (path === '/carts/bag/slots') return { required: true, slots: [{ id: '3:2026-09-16', date: '2026-09-16', from: '09:00', to: '12:00' }], selected: null }
    if (path === '/carts/bag/pickup-locations') return { locations: [{ id: '1', name: 'Springfield' }], selected: null }
    if (path === '/carts/bag/pickup-location') return cartBody('bag')
    if (path === '/carts/bag/payments') return { id: 'pay-1', status: 'pending', order: null }
    throw new Error(`unexpected ${method} ${path}`)
  })

  const offered = await http.getDeliverySlots('bag', 'standard')
  assert.equal(offered.slots[0].id, '3:2026-09-16')
  assert.deepEqual(calls.at(-1).query, { method: 'standard' })

  await http.getPickupLocations('bag', { method: 'collect', country: 'US' })
  assert.deepEqual(calls.at(-1).query, { method: 'collect' }, 'no postcode: nearest to the bag\'s own address')
  await http.getPickupLocations('bag', { method: 'collect', postalCode: '62701', country: 'US' })
  assert.deepEqual(calls.at(-1).query, { method: 'collect', zip: '62701', country: 'US' })

  await http.setPickupLocation('bag', { method: 'collect', locationId: '1' })
  assert.deepEqual(calls.at(-1).body, { method: 'collect', location_id: '1' })

  await http.createPayment('bag', { email: 'a@example.com', deliverySlot: '3:2026-09-16' })
  assert.equal(calls.at(-1).body.delivery_slot, '3:2026-09-16')
})
