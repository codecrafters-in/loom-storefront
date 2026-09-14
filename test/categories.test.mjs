import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryTrail, flattenCategories, productTrail } from '../src/lib/categories.js'

/*
 * Category trees past two levels.
 *
 * A third-level page used to be missing from the flattened list and title
 * itself "All products"; a product's breadcrumb printed a slug.
 */

const tree = [
  {
    slug: 'goods', name: 'Goods', parent: null,
    children: [{ slug: 'goods-tech', name: 'Tech', children: [{ slug: 'goods-tech-phones', name: 'Phones' }] }],
  },
  { slug: 'shirts', name: 'Shirts', parent: null, children: [] },
]

test('every level is in the flat list, with its parent', () => {
  const flat = flattenCategories(tree)
  assert.deepEqual(flat.map((c) => [c.slug, c.parent]), [
    ['goods', null], ['goods-tech', 'goods'], ['goods-tech-phones', 'goods-tech'], ['shirts', null],
  ])
})

test('a trail walks parents by name, or takes the path the backend sent', () => {
  const flat = flattenCategories(tree)
  assert.deepEqual(categoryTrail('goods-tech-phones', flat).map((c) => c.name), ['Goods', 'Tech', 'Phones'])
  const sent = [{ slug: 'x', name: 'X', path: [{ slug: 'root', name: 'Root' }, { slug: 'x', name: 'X' }] }]
  assert.deepEqual(categoryTrail('x', sent).map((c) => c.name), ['Root', 'X'])
  assert.deepEqual(categoryTrail('unknown', flat), [])
})

test('a product’s trail: its breadcrumbs, else its deepest category, else a slug', () => {
  assert.deepEqual(productTrail({ breadcrumbs: [{ slug: 'a', name: 'A' }] }, tree), [{ slug: 'a', name: 'A' }])
  assert.deepEqual(productTrail({ categories: ['goods', 'goods-tech-phones'] }, tree).map((c) => c.name), ['Goods', 'Tech', 'Phones'])
  assert.deepEqual(productTrail({ categories: ['mystery'] }, tree), [{ slug: 'mystery', name: 'mystery' }])
})
