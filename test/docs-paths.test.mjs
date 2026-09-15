import { test } from 'node:test'
import assert from 'node:assert/strict'
import { docPath } from '../src/data/docs.js'

/*
 * The documentation lives at /docs on the demo and at /admin/docs in the back
 * office. The admin menu linked to /docs, which a live store does not have, so
 * the store's team landed on "Page not found".
 */

test('public paths stay as they were: the overview is /docs, never /docs/readme', () => {
  assert.equal(docPath('readme'), '/docs')
  assert.equal(docPath('api'), '/docs/api')
})

test('the back office keeps its own paths', () => {
  assert.equal(docPath('readme', '/admin/docs'), '/admin/docs')
  assert.equal(docPath('checkout', '/admin/docs'), '/admin/docs/checkout')
})
