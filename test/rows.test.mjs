import { test } from 'node:test'
import assert from 'node:assert/strict'
import { perRow, promisesGrid } from '../src/lib/rows.js'

/*
 * The promises strip with however many promises the merchant writes. It was a
 * fixed three per row, so a fourth promise sat alone under the others.
 */

test('four promises: two by two on tablets, one row on a laptop', () => {
  assert.equal(promisesGrid(4), 'sm:grid-cols-2 lg:grid-cols-4')
})

test('three keep the look stores already had', () => {
  assert.equal(promisesGrid(3), 'sm:grid-cols-3 lg:grid-cols-3')
})

test('more than four make even rows; none or nonsense give nothing', () => {
  assert.equal(promisesGrid(5), 'sm:grid-cols-3 lg:grid-cols-3')
  assert.equal(promisesGrid(6), 'sm:grid-cols-3 lg:grid-cols-3')
  assert.equal(promisesGrid(8), 'sm:grid-cols-3 lg:grid-cols-4')
  for (const value of [0, undefined, null, -1, 'x']) assert.equal(promisesGrid(value), '')
  assert.equal(perRow(7, 4), 4)
})
