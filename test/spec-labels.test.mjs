import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attributeByKey, readableKey, specLabel } from '../src/data/attributes.js'

test("a merchant's own specification shows the label the store sent, or its key made readable", () => {
  assert.equal(specLabel('fabric'), attributeByKey.fabric.label, "the theme's wording wins for the keys it knows")
  assert.equal(specLabel('tastingNotes', [{ key: 'tastingNotes', label: 'Notes de dégustation' }]), 'Notes de dégustation')
  assert.equal(specLabel('tastingNotes'), 'Tasting notes')
  assert.equal(readableKey('made_in'), 'Made in')
  assert.equal(readableKey('bestFor'), 'Best for')
  assert.equal(readableKey(''), '')
})
