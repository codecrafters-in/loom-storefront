import test from 'node:test'
import assert from 'node:assert/strict'
import { num } from '../src/lib/config.js'

test('a blank number setting keeps its default instead of becoming zero', () => {
  assert.equal(num('', 12000), 12000, 'VITE_API_TIMEOUT left empty on the host')
  assert.equal(num('   ', 12000), 12000)
  assert.equal(num(undefined, 220), 220)
  assert.equal(num('abc', 150), 150)
  assert.equal(num('30000', 12000), 30000)
  assert.equal(num('0', 220), 0, 'an explicit 0 is still 0')
})
