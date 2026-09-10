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

  test('a listing page actually lists products', () => {
    /**
     * The failure this catches is silent: the prerenderer seeds a cache key the
     * page does not ask for, the page renders its empty state, and the HTML
     * looks the right size because the header and footer are in it. It happened
     * because the build script kept its own copy of the listing query and drifted
     * by one `null`.
     */
    for (const file of ['shop.html', 'shop/shirts.html', 'shop/knitwear.html', 'collections/new-season.html']) {
      const html = read(file)
      const links = new Set(html.match(/href="\/product\/[a-z0-9-]+"/g) || [])
      assert.ok(links.size >= 3, `${file} prerendered ${links.size} products`)
    }
  })

  test('images ship narrower copies with a sizes hint', () => {
    // `srcset` without `sizes` does nothing: the browser assumes the image
    // fills the viewport and picks the largest candidate every time.
    for (const file of ['shop.html', 'product/oxford-shirt-ecru.html']) {
      const html = read(file)
      assert.ok(html.includes('<picture>'), `${file} has no responsive images`)
      assert.match(html, /\.webp \d+w/, `${file} has no webp candidates`)
      assert.match(html, /<source[^>]*sizes="/, `${file} has srcset without sizes`)
    }
  })

  test('every srcset candidate exists on disk', () => {
    // A candidate that 404s is worse than no srcset: the browser picks it and
    // shows a broken image where the product was.
    const missing = new Set()
    for (const file of pages()) {
      for (const [, url] of read(file).matchAll(/(\/images\/[^\s"]+?\.webp) \d+w/g)) {
        if (!fs.existsSync(path.join(DIST, url.replace(/^\//, '')))) missing.add(url)
      }
    }
    assert.deepEqual([...missing], [])
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
    const NAMES = ['key_secret', 'smtpPassword', 'razorpayKeySecret', 'RAZORPAY_KEY_SECRET']
    for (const file of pages()) {
      const html = read(file)
      /**
       * The documentation names these fields on purpose — `/docs/checkout` is
       * the page that tells an implementer never to keep them in settings — so
       * a word scan over its text says nothing. What matters is the same thing
       * everywhere else: that nothing from the store's own configuration
       * carried a secret into the page. On a docs page that surface is the API
       * cache seed and only the API cache seed; the other seed is markdown
       * from a public repository.
       */
      const haystack = file.startsWith('docs') ? cacheSeed(html) : html
      for (const needle of NAMES) {
        assert.ok(!haystack.includes(needle), `${file} mentions ${needle}`)
      }
    }
  })

  test('the documentation is public, prerendered and reads as itself', () => {
    const files = pages()
    assert.ok(files.includes('docs.html'), 'the overview was not prerendered')
    assert.ok(files.includes('docs/api.html'), 'the API reference was not prerendered')
    // One URL per document: the overview is /docs, never /docs/readme.
    assert.ok(!files.includes('docs/readme.html'), '/docs/readme duplicates /docs')

    const api = read('docs/api.html')
    assert.match(api, /<title>API reference — /)
    assert.match(api, /rel="canonical" href="[^"]+\/docs\/api"/)
    // The words, not a skeleton: the markdown has to have been resolved before
    // the render, and inlined so the first client render finds the same text.
    assert.ok(bodyOf(api).length > 20000, 'the reference rendered without its markdown')
    assert.ok(api.includes('window.__LOOM_DOCS__'), 'the source was not seeded for hydration')
  })
})

/** The API cache seed, which is where a setting could reach a page. */
function cacheSeed(html) {
  return html.match(/window\.__LOOM_CACHE__=[\s\S]*?<\/script>/)?.[0] ?? ''
}
