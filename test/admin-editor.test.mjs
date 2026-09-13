import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const { slugify, slugProblem } = await import(`${root}lib/slug.js`)
const { specsFromHighlights, highlightsFromSpecs } = await import(`${root}lib/spec-sync.js`)

/* ── slugs ─────────────────────────────────────────────────────────────── */

test('typing a slug keeps the dash before the next word', () => {
  assert.equal(slugify('linen ', { typing: true }), 'linen-')
  assert.equal(slugify('linen-', { typing: true }), 'linen-')
  assert.equal(slugify('linen-'), 'linen', 'the dash is tidied once typing is done')
  assert.equal(slugify('  Linen Camp-Collar Shirt! '), 'linen-camp-collar-shirt')
})

test('a slug ending in a number is refused with an example', () => {
  assert.match(slugProblem('levis-jeans-501'), /can't end in a number/)
  assert.match(slugProblem('501'), /can't end in a number/)
  assert.equal(slugProblem('levis-501-jeans'), null)
  assert.equal(slugProblem('tee2'), null, 'only a whole trailing number reads as a record id')
  assert.equal(slugProblem('levis-jeans-501', { allowTrailingNumber: true }), null)
})

test('a malformed slug is refused, an empty one is left to the title check', () => {
  assert.ok(slugProblem('bad--slug'))
  assert.ok(slugProblem('Bad'))
  assert.equal(slugProblem(''), null)
})

/* ── highlights and specifications ─────────────────────────────────────── */

test('editing a highlight updates the matching specification', () => {
  const specs = { fabric: 'Linen', fit: 'Relaxed' }
  const next = specsFromHighlights(specs, [{ key: 'fabric', value: 'Merino wool' }])
  assert.deepEqual(next, { fabric: 'Merino wool', fit: 'Relaxed' })
  assert.equal(specs.fabric, 'Linen', 'the input is not mutated')
})

test('a highlight with no specification row does not invent one', () => {
  const specs = { fit: 'Relaxed' }
  assert.equal(specsFromHighlights(specs, [{ key: 'fabric', value: 'Linen' }, { key: '', value: 'x' }]), specs)
})

test('editing a specification updates the matching highlight', () => {
  const rows = [{ key: 'fabric', value: 'Linen' }, { key: 'sleeve', value: 'Full sleeve' }]
  const next = highlightsFromSpecs(rows, { fabric: 'Cotton' })
  assert.deepEqual(next, [{ key: 'fabric', value: 'Cotton' }, { key: 'sleeve', value: 'Full sleeve' }])
  assert.equal(highlightsFromSpecs(rows, { fabric: 'Linen' }), rows, 'nothing to change returns the same rows')
})

/* ── admin categories ──────────────────────────────────────────────────── */

test('the admin category list is a tree like the public one', async () => {
  const admin = await api.adminListCategories()
  const shop = await api.listCategories()
  assert.ok(Array.isArray(admin.items) && admin.items.length > 0)
  assert.equal(admin.total, admin.items.length)
  assert.deepEqual(admin.items.map((c) => c.slug), shop.items.map((c) => c.slug))
})
