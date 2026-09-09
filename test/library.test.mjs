import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api } = await loadApp()

test('the library starts empty — it is the store\'s vocabulary, not ours', async () => {
  const library = await api.listLibrary()
  assert.deepEqual([library.attributes.length, library.features.length, library.assurances.length], [0, 0, 0])
})

test('an unrecognised attribute is learned from the product that used it', async () => {
  // A merchant listing a hundred shirts types "Collar type" on the first and
  // cannot remember on the sixtieth whether they wrote "Collar", "Neck" or
  // "Collar type". Three spellings is a facet that filters nothing.
  const id = (await api.getProduct('oxford-shirt-ecru')).id
  const draft = await api.adminGetProduct(id)
  draft.enrichment = {
    ...draft.enrichment,
    specs: { ...draft.enrichment.specs, collar_type: 'Button-down', pocketStyle: 'Patch' },
  }
  await api.adminSaveProduct(draft)

  const keys = (await api.listLibrary()).attributes.map((a) => a.key)
  assert.ok(keys.includes('collar_type'))
  assert.ok(keys.includes('pocketStyle'))
})

test('built-in keys are not copied into the store\'s own list', async () => {
  const keys = (await api.listLibrary()).attributes.map((a) => a.key)
  assert.ok(!keys.includes('sleeve'), 'the shipped vocabulary leaked into the library')
})

test('a key is given a readable label', async () => {
  const byKey = Object.fromEntries((await api.listLibrary()).attributes.map((a) => [a.key, a]))
  assert.equal(byKey.collar_type.label, 'Collar type')
  assert.equal(byKey.pocketStyle.label, 'Pocket style')
})

test('it is offered on the next product, marked as the store\'s own', async () => {
  const { items } = await api.listAttributes()
  const learned = items.find((a) => a.key === 'collar_type')
  assert.ok(learned, 'a learned attribute never reached the editor')
  assert.equal(learned.custom, true)
  assert.ok(learned.values.includes('Button-down'))
})

test('a second product adds its value to the same key', async () => {
  const other = (await api.adminListProducts({ perPage: 200 })).items.find((p) => p.slug === 'poplin-shirt-white')
  const draft = await api.adminGetProduct(other.id)
  draft.enrichment = { ...draft.enrichment, specs: { ...draft.enrichment?.specs, collar_type: 'Spread' } }
  await api.adminSaveProduct(draft)

  const learned = (await api.listAttributes()).items.find((a) => a.key === 'collar_type')
  assert.deepEqual([...learned.values].sort(), ['Button-down', 'Spread'])
})

test('whole blocks are saved explicitly, because copy is an editorial choice', async () => {
  await api.saveLibraryItem({ kind: 'features', item: { icon: 'leaf', title: 'Rain-fed flax', body: 'No irrigation.' } })
  await api.saveLibraryItem({ kind: 'assurances', item: { icon: 'shield', label: 'Lifetime repairs' } })

  const vocab = await api.listAttributes()
  assert.equal(vocab.features.length, 1)
  assert.ok(vocab.assurances.some((a) => a.label === 'Lifetime repairs'))
})

test('saved blocks can be removed', async () => {
  const { features } = await api.listLibrary()
  await api.deleteLibraryItem({ kind: 'features', id: features[0].id })
  assert.equal((await api.listLibrary()).features.length, 0)
})

test('an unknown kind is refused rather than silently written', async () => {
  await assert.rejects(() => api.saveLibraryItem({ kind: 'nonsense', item: {} }),
    (err) => err.code === 'invalid_kind')
})
