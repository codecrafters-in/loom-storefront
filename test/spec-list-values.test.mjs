import test from 'node:test'
import assert from 'node:assert/strict'
import { addListValue, listValues } from '../src/lib/spec-sync.js'

test('a specification with several values is a comma-separated list', () => {
  assert.deepEqual(listValues(' Linen, , Hemp blend ,'), ['Linen', 'Hemp blend'])
  assert.deepEqual(listValues(undefined), [])
})

test('picking a known value appends it once', () => {
  assert.equal(addListValue('', 'Linen'), 'Linen')
  assert.equal(addListValue('Linen', 'Hemp blend'), 'Linen, Hemp blend')
  assert.equal(addListValue('Linen, hemp blend', 'Hemp blend'), 'Linen, hemp blend')
})
