import { test } from 'node:test'
import assert from 'node:assert/strict'
import { own } from './helpers/browser.mjs'

const cache = await import('../src/lib/api/cache.js')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Age an entry by giving it a 1ms TTL and waiting.
 *
 * Seeding sessionStorage by hand does not work and the reason is worth
 * recording: `loadPersisted()` memoises on first read, so a write straight to
 * storage after the module has started is invisible to it. That is correct in a
 * browser — sessionStorage is per-tab and nothing else writes it — but it makes
 * hand-seeding a test fixture silently do nothing. Going through the public
 * surface exercises the real path anyway.
 */
async function seedStale(key, value) {
  cache.clearAll()
  await cache.cached(key, async () => value, 1)
  await sleep(5)
}

test('a fresh entry is served without calling the source', async () => {
  cache.clearAll()
  await cache.cached('k1', async () => 'first', 5000)
  const again = await cache.cached('k1', async () => { throw new Error('should not be called') }, 5000)
  assert.equal(again, 'first')
})

test('identical in-flight requests are joined, not repeated', async () => {
  cache.clearAll()
  let calls = 0
  const fn = async () => { calls += 1; return 'x' }
  await Promise.all([cache.dedupe('k2', fn), cache.dedupe('k2', fn), cache.dedupe('k2', fn)])
  assert.equal(calls, 1)
})

test('a stale entry is served immediately and refreshed behind it', async () => {
  await seedStale('k3', 'old')
  const served = await cache.cached('k3', async () => 'new', 5000)
  assert.equal(served, 'old', 'the screen should not blank for data it already had')
  await sleep(20)
  const next = await cache.cached('k3', async () => 'should not be called', 5000)
  assert.equal(next, 'new')
})

test('a refresh that disagrees wakes the listeners', async () => {
  // Without this the refresh lands in storage and the open page keeps showing
  // what it had — how a product reads right in one place and wrong in another.
  await seedStale('k4', { title: 'old' })
  const woken = []
  const off = cache.onRevalidated((key) => woken.push(key))
  await cache.cached('k4', async () => ({ title: 'new' }), 5000)
  await sleep(20)
  off()
  assert.deepEqual(woken, ['k4'])
})

test('a refresh that agrees wakes nobody', async () => {
  await seedStale('k5', { a: 1 })
  const woken = []
  const off = cache.onRevalidated((key) => woken.push(key))
  await cache.cached('k5', async () => ({ a: 1 }), 5000)
  await sleep(20)
  off()
  assert.deepEqual(woken, [], 'an unchanged response should cost a comparison and nothing else')
})

test('a failed refresh keeps serving the stale copy', async () => {
  await seedStale('k6', 'old')
  const served = await cache.cached('k6', async () => { throw new Error('offline') }, 5000)
  assert.equal(served, 'old')
  await sleep(20)
  const next = await cache.cached('k6', async () => 'recovered', 5000)
  assert.equal(next, 'old', 'a failed refresh is not a broken page')
})

test('invalidate drops a namespace and leaves the rest', async () => {
  cache.clearAll()
  await cache.cached('getProduct:a', async () => 1, 5000)
  await cache.cached('getCart:x', async () => 2, 5000)
  cache.invalidate('getProduct')
  assert.equal(await cache.cached('getProduct:a', async () => 99, 5000), 99)
  assert.equal(await cache.cached('getCart:x', async () => 99, 5000), 2)
})

test('invalidateAndNotify purges and wakes, for a change nothing local can describe', async () => {
  cache.clearAll()
  await cache.cached('getProduct:b', async () => 'v1', 5000)
  const woken = []
  const off = cache.onRevalidated((key) => woken.push(key))
  cache.invalidateAndNotify()
  off()
  assert.deepEqual(woken, ['*'], 'emptying a cache only helps the next call')
  assert.equal(await cache.cached('getProduct:b', async () => 'v2', 5000), 'v2')
})

test('cache keys do not depend on object key order', () => {
  assert.equal(cache.keyOf('listProducts', [{ a: 1, b: 2 }]), cache.keyOf('listProducts', [{ b: 2, a: 1 }]))
  assert.notEqual(cache.keyOf('listProducts', [{ a: 1 }]), cache.keyOf('listProducts', [{ a: 2 }]))
})

test('a cache entry survives into a new tab-session read', async () => {
  cache.clearAll()
  await cache.cached('persisted', async () => 'value', 5000)
  assert.ok(own.get('loom.cache')?.includes('persisted'), 'a reloaded tab should start warm')
})
