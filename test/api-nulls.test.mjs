import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialCombo, comboState } from '../src/lib/variants.js'

// Odoo sends `null`, not a missing key, for fields a product does not have.
test('a product that is not a combo (combo: null) has nothing to pick', () => {
  assert.deepEqual(initialCombo(null), {})
  assert.deepEqual(comboState(null, null), { missing: [], extra: 0, complete: true })
})
