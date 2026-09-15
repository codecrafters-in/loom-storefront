import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blogEnabled, isBlogPath, withoutBlogLinks } from '../src/lib/blog.js'

/*
 * A blog the store switched off (`features.blog: false`): its addresses answer the not-found page, and no menu or
 * footer link leads there.
 */

const OFF = { features: { blog: false } }
const ON = { features: { blog: true } }

test('only an explicit false turns the blog off', () => {
  assert.equal(blogEnabled(OFF), false)
  assert.equal(blogEnabled(ON), true)
  assert.equal(blogEnabled({ features: {} }), true)
  assert.equal(blogEnabled(null), true)
})

test("the blog's addresses", () => {
  for (const to of ['/blog', '/blog/', '/blog/a-post', '/blog?tag=news', '/blog#top']) assert.equal(isBlogPath(to), true, to)
  for (const to of ['/blogger', '/pages/blog', '/shop', '', null, 'https://blog.example.com']) assert.equal(isBlogPath(to), false, String(to))
})

test('menus and footer columns leave out the blog when it is off', () => {
  const primary = [
    { label: 'Shop', to: '/shop', children: [{ label: 'Journal', to: '/blog' }, { label: 'Shirts', to: '/shop/shirts' }] },
    { label: 'Journal', to: '/blog' },
  ]
  assert.deepEqual(withoutBlogLinks(primary, OFF), [{ label: 'Shop', to: '/shop', children: [{ label: 'Shirts', to: '/shop/shirts' }] }])
  assert.equal(withoutBlogLinks(primary, ON), primary, 'untouched while it is on')

  const footer = [
    { title: 'Read', links: [{ label: 'Journal', to: '/blog' }] },
    { title: 'Help', links: [{ label: 'Returns', to: '/pages/returns' }, { label: 'News', to: '/blog/news' }] },
    { title: 'Soon', links: [] },
  ]
  assert.deepEqual(withoutBlogLinks(footer, OFF), [
    { title: 'Help', links: [{ label: 'Returns', to: '/pages/returns' }] },
    { title: 'Soon', links: [] },
  ], 'a column that had only blog links goes; one the store left empty is its own business')
  assert.deepEqual(withoutBlogLinks(undefined, OFF), [])
})
