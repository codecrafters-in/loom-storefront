import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { shared, fireStorage } from './helpers/browser.mjs'

const { recent, remember, forget, adopt, onRecentChange } = await import('../src/lib/recentlyViewed.js')

beforeEach(() => {
  for (const key of [...shared.keys()]) if (key.startsWith('loom.recent')) shared.delete(key)
})

test('the most recent view comes first', () => {
  remember('a')
  remember('b')
  remember('c')
  assert.deepEqual(recent().map((r) => r.slug), ['c', 'b', 'a'])
})

test('looking at something again moves it, it does not duplicate it', () => {
  remember('a')
  remember('b')
  remember('a')
  assert.deepEqual(recent().map((r) => r.slug), ['a', 'b'])
})

test('the list is capped', () => {
  for (let i = 0; i < 30; i += 1) remember(`p${i}`)
  assert.equal(recent().length, 12)
  assert.equal(recent()[0].slug, 'p29')
})

test('each customer has their own list', () => {
  // A shared laptop is the normal case in a household. A rail showing the last
  // person's browsing is both a privacy problem and a useless recommendation.
  remember('guest-thing')
  remember('ada-thing', 'cus_ada')
  remember('bob-thing', 'cus_bob')

  assert.deepEqual(recent('cus_ada').map((r) => r.slug), ['ada-thing'])
  assert.deepEqual(recent('cus_bob').map((r) => r.slug), ['bob-thing'])
  assert.deepEqual(recent().map((r) => r.slug), ['guest-thing'])
})

test('signing out returns you to your own guest list, not theirs', () => {
  remember('guest-thing')
  remember('ada-thing', 'cus_ada')
  assert.deepEqual(recent().map((r) => r.slug), ['guest-thing'])
})

test('signing in carries the browsing you just did', () => {
  // Ten minutes of browsing then a sign-in to check out should not lose the ten
  // minutes.
  remember('browsed-1')
  remember('browsed-2')
  const merged = adopt('cus_ada')
  assert.deepEqual(merged.map((r) => r.slug), ['browsed-2', 'browsed-1'])
})

test('the merge keeps both lists and drops the duplicates', () => {
  remember('older', 'cus_ada')
  remember('shared-item', 'cus_ada')
  remember('shared-item')
  remember('newest')

  const merged = adopt('cus_ada').map((r) => r.slug)
  assert.equal(new Set(merged).size, merged.length, 'the same product appears twice')
  assert.deepEqual([...merged].sort(), ['newest', 'older', 'shared-item'])
})

test('the guest list is cleared after it is adopted', () => {
  // Otherwise the next person on this browser inherits it.
  remember('browsed')
  adopt('cus_ada')
  assert.deepEqual(recent(), [])
})

test('adopting nothing is not an error', () => {
  assert.deepEqual(adopt('cus_ada'), [])
  assert.deepEqual(adopt(null), [])
})

test('corrupt storage reads as empty rather than throwing', () => {
  shared.set('loom.recent:guest', 'not json at all')
  assert.deepEqual(recent(), [])
  shared.set('loom.recent:guest', '{"not":"an array"}')
  assert.deepEqual(recent(), [])
  shared.set('loom.recent:guest', '[{"no":"slug"},{"slug":"good"}]')
  assert.deepEqual(recent().map((r) => r.slug), ['good'])
})

test('forget clears one list and leaves the others', () => {
  remember('mine', 'cus_ada')
  remember('theirs', 'cus_bob')
  forget('cus_ada')
  assert.deepEqual(recent('cus_ada'), [])
  assert.deepEqual(recent('cus_bob').map((r) => r.slug), ['theirs'])
})

test('browsing in another tab is still this person browsing', () => {
  let woken = 0
  const off = onRecentChange('cus_ada', () => { woken += 1 })
  fireStorage('loom.recent:cus_ada')
  fireStorage('loom.recent:cus_bob')
  off()
  assert.equal(woken, 1, 'it should wake for its own list and nobody else\'s')
})

test('nothing is ever sent anywhere', () => {
  // The whole reason this needs no consent banner: the list never leaves the
  // device, so there is nothing to leak and nothing to ask permission for.
  const source = fs.readFileSync(new URL('../src/lib/recentlyViewed.js', import.meta.url), 'utf8')
  assert.ok(!/fetch\(|api\./.test(source), 'recently viewed must not talk to a server')
})
