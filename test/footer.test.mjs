import { test } from 'node:test'
import assert from 'node:assert/strict'
import { footerLayout, perRow } from '../src/lib/footer.js'

/*
 * The footer with any number of link columns.
 *
 * It used to be the brand column plus a fixed three, so a fourth column sat
 * alone on a second row. Rows are now even at every width, and the brand
 * column only sits beside the links while they have room.
 */

const cols = (classes, prefix) => {
  const match = classes.split(' ').find((c) => c.startsWith(`${prefix}grid-cols-`))
  return match ? Number(match.slice(`${prefix}grid-cols-`.length)) : null
}

test('rows are as even as they can be', () => {
  assert.equal(perRow(4, 3), 2, 'four in rows of up to three: two and two, not three and one')
  assert.equal(perRow(5, 4), 3)
  assert.equal(perRow(7, 6), 4)
  assert.equal(perRow(3, 4), 3)
  assert.equal(perRow(0, 4), 0)
})

test('four columns: two by two on a phone, one row from tablets, beside the brand on a laptop', () => {
  const layout = footerLayout(4)
  assert.equal(cols(layout.links, ''), 2)
  assert.equal(cols(layout.links, 'md:'), 4)
  assert.equal(cols(layout.links, 'lg:'), 4)
  assert.equal(layout.beside, 'laptop')
  assert.match(layout.outer, /^lg:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,4fr\)\]$/)
})

test('three columns keep the look stores already had', () => {
  const layout = footerLayout(3)
  assert.equal(cols(layout.links, 'lg:'), 3)
  assert.equal(layout.beside, 'laptop')
})

test('five sit beside the brand only on a large screen; six and more go under it', () => {
  assert.equal(footerLayout(5).beside, 'desktop')
  assert.match(footerLayout(5).outer, /^xl:/)
  assert.equal(cols(footerLayout(5).links, 'md:'), 3)
  assert.equal(footerLayout(6).beside, 'never')
  assert.equal(footerLayout(6).outer, '')
  assert.equal(cols(footerLayout(7).links, 'lg:'), 4, 'seven make rows of four and three')
})

test('no columns, or nonsense, leave the brand column alone', () => {
  for (const value of [0, undefined, null, -2, 'x']) {
    assert.deepEqual(footerLayout(value), { outer: '', links: '', beside: 'never' })
  }
  assert.equal(cols(footerLayout(1).links, ''), 1)
})
