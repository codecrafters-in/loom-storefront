import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

/**
 * What `npm run build` actually wrote.
 *
 * These assert the output rather than the code, because every way prerendering
 * fails is invisible in the source: data that never reached the render, a
 * duplicate title, a page that shipped its loading skeleton. Each one looks
 * fine locally and shows up as a page nobody can find.
 *
 * Skipped when `dist/` has not been built, so `npm test` on a clean checkout
 * does not fail for the wrong reason.
 */
const DIST = new URL('../dist/', import.meta.url).pathname
const built = fs.existsSync(path.join(DIST, 'index.html'))

const read = (rel) => fs.readFileSync(path.join(DIST, rel), 'utf8')
const bodyOf = (html) => {
  const start = html.indexOf('<div id="root">')
  if (start < 0) return ''
  return html.slice(start + '<div id="root">'.length, html.lastIndexOf('</div>'))
}
const pages = () => {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.html')) out.push(path.relative(DIST, full))
    }
  }
  walk(DIST)
  return out.filter((f) => read(f).includes('<div id="root">'))
}

describe('prerendered output', { skip: built ? false : 'run `npm run build` first' }, () => {
  test('the routes worth indexing are all there', () => {
    const files = pages()
    assert.ok(files.length >= 50, `only ${files.length} pages were written`)
    for (const expected of ['index.html', 'shop.html', 'shop/shirts.html',
      'product/oxford-shirt-ecru.html', 'collections/new-season.html', 'pages/care.html']) {
      assert.ok(files.includes(expected), `${expected} was not prerendered`)
    }
  })

  test('no page carries two titles', () => {
    // A browser keeps the first `<title>` it meets, so a leftover template
    // title silently gives every page the same one.
    for (const file of pages()) {
      const count = read(file).match(/<title>/g)?.length ?? 0
      assert.equal(count, 1, `${file} has ${count} titles`)
    }
  })

  test('every page has real content, not a loading skeleton', () => {
    for (const file of pages()) {
      const body = bodyOf(read(file))
      assert.ok(body.length > 5000, `${file} rendered only ${body.length} bytes`)
    }
  })

  test('a product page carries the things a crawler needs', () => {
    const html = read('product/oxford-shirt-ecru.html')
    assert.match(html, /<title>Everyday Oxford Shirt — LOOM<\/title>/)
    assert.match(html, /<h1/, 'no H1')
    assert.ok(html.includes('$118.00'), 'the price is not in the HTML')
    assert.match(html, /rel="canonical"/)
    assert.match(html, /property="og:image"/)
    assert.match(html, /application\/ld\+json/)
    assert.match(html, /"@type":"Product"/)
    assert.match(html, /schema\.org\/(In|Out)OfStock|schema\.org\/InStock/, 'availability is not derived')
  })

  test('titles are per route, not shared', () => {
    const titles = ['index.html', 'shop.html', 'shop/shirts.html', 'product/oxford-shirt-ecru.html',
      'collections/new-season.html', 'pages/care.html']
      .map((f) => read(f).match(/<title>(.*?)<\/title>/)[1])
    assert.equal(new Set(titles).size, titles.length, `titles repeat: ${titles.join(' | ')}`)
    assert.match(titles[4], /New Season/)
  })

  test('each page inlines the data it was rendered from', () => {
    // Without it the browser's first render — cache empty — produces different
    // markup, React calls it a mismatch and discards the whole prerendered tree.
    for (const file of pages()) {
      assert.match(read(file), /window\.__LOOM_CACHE__=/, `${file} has no hydration payload`)
    }
  })

  test('the payload holds the keys the page will look for', () => {
    const html = read('product/oxford-shirt-ecru.html')
    const payload = JSON.parse(html.match(/window\.__LOOM_CACHE__=(.*?)<\/script>/s)[1]
      .replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'))
    assert.ok(payload['getBootstrap:[]'], 'settings were not seeded, so the header would render empty')
    assert.ok(Object.keys(payload).some((k) => k.startsWith('getProduct:')), 'the product was not seeded')
  })

  test('nothing per-visitor was prerendered', () => {
    // A prerendered cart is a stale bag served to everyone.
    for (const file of ['cart.html', 'checkout.html', 'account.html', 'admin.html', 'search.html']) {
      assert.ok(!fs.existsSync(path.join(DIST, file)), `${file} should stay a single-page route`)
    }
  })

  test('the host config does not shadow the prerendered files', () => {
    /**
     * The catch-all rewrite is what makes deep links work in a single-page app,
     * and it is also what silently undoes prerendering: without `cleanUrls`,
     * `/product/x` matches no file, falls through to the rewrite, and every
     * route serves the home page shell again. Fifty-three files written and
     * none of them reachable.
     */
    const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    assert.equal(vercel.cleanUrls, true, 'without cleanUrls, /product/x never finds product/x.html')
    const catchAll = vercel.rewrites?.find((r) => r.source === '/(.*)')
    assert.ok(catchAll, 'deep links into the SPA routes need a fallback rewrite')
    assert.notEqual(catchAll.destination, '/', 'rewriting to "/" serves the home page for every route')
  })

  test('security headers are set on both hosts, not just one', () => {
    const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
    const netlify = fs.readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    const set = new Set(vercel.headers.flatMap((h) => h.headers.map((x) => x.key)))
    for (const header of ['X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'Permissions-Policy']) {
      assert.ok(set.has(header), `vercel.json is missing ${header}`)
      assert.ok(netlify.includes(header), `public/_headers is missing ${header}`)
    }
  })

  test('no secret reached the output', () => {
    for (const file of pages()) {
      const html = read(file)
      for (const needle of ['key_secret', 'smtpPassword', 'razorpayKeySecret', 'RAZORPAY_KEY_SECRET']) {
        assert.ok(!html.includes(needle), `${file} mentions ${needle}`)
      }
    }
  })
})
