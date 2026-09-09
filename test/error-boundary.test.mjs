import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import './helpers/browser.mjs'

/**
 * The two decisions inside the boundary.
 *
 * Node cannot import `.jsx` and mounting a component properly would mean a DOM
 * and a testing library — a real cost against three runtime dependencies. What
 * matters here is not the markup anyway: it is the reset, because a boundary
 * that never clears leaves every page after the first one broken for the rest
 * of the session, and nobody sees that until they navigate.
 */
const { shouldReset, describeError } = await import('../src/lib/errors.js')

test('navigating away clears the boundary', () => {
  assert.equal(shouldReset(new Error('boom'), '/product/a', '/product/b'), true)
})

test('re-rendering the same route does not', () => {
  // Otherwise it flickers between the error screen and the render that throws.
  assert.equal(shouldReset(new Error('boom'), '/product/a', '/product/a'), false)
})

test('a healthy boundary is not disturbed by a route change', () => {
  assert.equal(shouldReset(null, '/a', '/b'), false)
})

test('a report carries a label, not a stack trace', () => {
  assert.equal(describeError(new Error('boom')), 'boom')
  assert.equal(describeError('a string'), 'a string')
  assert.equal(describeError(undefined), 'Unknown error')
  assert.equal(describeError(new Error('x'.repeat(400))).length, 200)
})

test('the boundary is wired inside the layout, not around it', () => {
  // Outside, a failed route takes the header, the bag and the search with it —
  // somebody who hits it cannot keep shopping, which turns an incident into a
  // bounce.
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const layout = app.indexOf('<Route element={<Layout />}>')
  const boundary = app.indexOf('<Boundary>')
  assert.ok(boundary > 0, 'no boundary in App')
  assert.ok(boundary < layout, 'the boundary must wrap the routes')
  assert.match(app, /resetKey=\{pathname\}/, 'the boundary never resets')
})
