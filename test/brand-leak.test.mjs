import test from 'node:test'
import assert from 'node:assert/strict'
import { configuredValues, findLeaks, scans, withoutConfigured } from '../scripts/brand-leak.mjs'

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

test("the store's own settings are not demo copy, and a real leak next to them is still found", () => {
  const values = configuredValues({
    VITE_DATA_SOURCE: 'api',
    VITE_API_BASE_URL: 'https://yh.codecrafters.in/loom/api/v1/loom',
    SITE_URL: 'https://loom-studio.codecrafters.in',
    NODE_ENV: 'production',
  })
  assert.deepEqual(values, ['https://yh.codecrafters.in/loom/api/v1/loom', 'https://loom-studio.codecrafters.in'])
  const bundle = 'VITE_API_BASE_URL:"https://yh.codecrafters.in/loom/api/v1/loom",SITE:"https://loom-studio.codecrafters.in"'
  assert.equal(findLeaks(withoutConfigured(bundle, values), 'a.js').length, 0)
  assert.equal(findLeaks(withoutConfigured(bundle + ' A theme by CodeCrafters', values), 'a.js').length, 1)
})
