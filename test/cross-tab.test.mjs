import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp, shared, fireStorage, otherTabWrites, settle } from './helpers/browser.mjs'

/**
 * This process is one tab. `localStorage` is shared with the imaginary other
 * tab, `sessionStorage` and every module singleton are not — which is exactly
 * the real asymmetry, and the reason two tabs can disagree at all.
 */
const { api, cache, root } = await loadApp()
const { onExternalWrite, STORAGE_KEYS } = await import(`${root}lib/crossTab.js`)

test('a variant price edited in another tab reaches this one', async () => {
  await api.getProduct('oxford-shirt-ecru') // warm this tab's cache
  let woken = 0
  const off = cache.onRevalidated(() => { woken += 1 })

  await otherTabWrites('loom.db', (store) => {
    store.products.find((p) => p.slug === 'oxford-shirt-ecru').variants[0].price =
      { amount: 24900, currency: 'USD' }
    return store
  })

  const p = await api.getProduct('oxford-shirt-ecru')
  off()
  assert.equal(p.variants[0].price.amount, 24900, 'the shop tab is still serving the old price')
  assert.ok(woken > 0, 'nothing told the open page to re-read')
})

test('a title, a setting and the listing pages all follow', async () => {
  await otherTabWrites('loom.db', (store) => {
    store.products.find((p) => p.slug === 'cotton-cap').title = 'RENAMED IN THE OTHER TAB'
    store.settings.commerce.returnsWindowDays = 7
    return store
  })

  assert.equal((await api.getProduct('cotton-cap')).title, 'RENAMED IN THE OTHER TAB')
  assert.equal((await api.getStorefront()).commerce.returnsWindowDays, 7)

  const { items } = await api.listProducts({ perPage: 200 })
  assert.equal(
    items.find((p) => p.slug === 'cotton-cap')?.title,
    'RENAMED IN THE OTHER TAB',
    'the listing disagreed with the detail page',
  )
})

test('unpublishing elsewhere stops it being reachable here', async () => {
  await otherTabWrites('loom.db', (store) => {
    store.products.find((p) => p.slug === 'cotton-cap').published = false
    return store
  })
  await assert.rejects(() => api.getProduct('cotton-cap'), (err) => err.status === 404)
})

test('emptying the bag in another tab empties it here', async () => {
  const product = await api.getProduct('oxford-shirt-ecru')
  const variant = product.variants.find((v) => v.available)
  await api.addToCart({ variantId: variant.id, quantity: 1 })

  let seen = null
  const off = onExternalWrite(STORAGE_KEYS.cart, async () => { seen = await api.getCart() })
  await otherTabWrites('loom.cart', (cart) => ({ ...cart, lines: [] }))
  off()

  assert.equal(seen?.lines?.length, 0)
})

test('a heart filled in another tab fills here', async () => {
  let slugs = null
  const off = onExternalWrite(STORAGE_KEYS.wishlist, async () => {
    slugs = (await api.getWishlist()).items.map((p) => p.slug)
  })
  shared.set('loom.wishlist', JSON.stringify(['wool-overcoat']))
  fireStorage('loom.wishlist')
  await settle()
  off()

  assert.ok(slugs?.includes('wool-overcoat'))
})

test('signing out in another tab signs out here', async () => {
  // A tab still showing an account menu, an order history and a saved address
  // for somebody who has left is the disclosure order scoping was fixed to
  // prevent, arriving through a different door.
  await api.login({ email: 'demo@loom.store', password: 'demo1234' })

  let who = 'still signed in'
  const off = onExternalWrite(STORAGE_KEYS.session, async () => {
    try { who = (await api.getMe()).email } catch { who = 'signed out' }
  })
  shared.set('loom.customer', 'null')
  shared.set('loom.session', 'null')
  fireStorage('loom.customer')
  await settle()
  off()

  assert.equal(who, 'signed out')
})

test('"clear site data" wakes every subscriber', () => {
  // The browser reports a full clear as `key === null`. A listener that filters
  // on its own key drops it and goes on showing data that no longer exists.
  let woken = false
  const off = onExternalWrite(STORAGE_KEYS.cart, () => { woken = true })
  fireStorage(null, null)
  off()
  assert.ok(woken)
})

test('a half-written store from another tab does not take this one down', async () => {
  shared.set('loom.db', '{ not json')
  fireStorage('loom.db')
  await settle(50)
  await assert.doesNotReject(() => api.getProduct('oxford-shirt-ecru'))
})
