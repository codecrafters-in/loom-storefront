import test from 'node:test'
import assert from 'node:assert/strict'
import { findLeaks, scans } from '../scripts/brand-leak.mjs'

test('shopper-facing chunks are scanned; the team documentation is not', () => {
  assert.equal(scans('index-Dt2Jhq2e.js'), true)
  assert.equal(scans('Checkout-a1b2c3.js'), true)
  assert.equal(scans('doc-API-a8d3pUlX.js'), false)
  assert.equal(scans('index-DM-bzCk2.css'), false)
})

test('a demo brand name is found, the module menu name is not', () => {
  assert.equal(findLeaks('Welcome to LOOM', 'a.js').length, 1)
  assert.equal(findLeaks('Open LOOM Storefront › Stores', 'a.js').length, 0)
  assert.equal(findLeaks('Storefront documentation.', 'a.js').length, 0)
})
