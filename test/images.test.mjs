import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import './helpers/browser.mjs'

const { responsive, SIZES } = await import('../src/lib/images.js')
const { default: manifest } = await import('../src/data/responsive.js')

test('every manifest entry has the files it promises', () => {
  // A srcset candidate that 404s is worse than no srcset: the browser picks it
  // and shows a broken image where the product was.
  const missing = []
  for (const [src, widths] of Object.entries(manifest)) {
    for (const width of widths) {
      const file = new URL(`../public${src.replace(/\.jpg$/, `-${width}.webp`)}`, import.meta.url)
      if (!fs.existsSync(file)) missing.push(`${src} @${width}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('a narrower copy is genuinely narrower', () => {
  // The whole point is bytes. If a derivative is not smaller than its source,
  // it is costing a request and saving nothing.
  const [src, widths] = Object.entries(manifest).find(([s]) => s.includes('/products/'))
  const jpg = fs.statSync(new URL(`../public${src}`, import.meta.url)).size
  const small = fs.statSync(new URL(`../public${src.replace(/\.jpg$/, `-${widths[0]}.webp`)}`, import.meta.url)).size
  assert.ok(small < jpg / 2, `${small} is not meaningfully smaller than ${jpg}`)
})

test('a bundled photograph gets webp candidates', () => {
  const out = responsive('/images/products/oxford-shirt-ecru-1.jpg')
  assert.equal(out.type, 'image/webp')
  assert.match(out.srcSet, /oxford-shirt-ecru-1-400\.webp 400w/)
  assert.match(out.srcSet, /oxford-shirt-ecru-1-900\.webp 900w/)
})

test('anything not processed falls through untouched', () => {
  // Uploaded files, CDN URLs and SVGs must render as a plain img rather than
  // pointing a srcset at files that were never generated.
  assert.equal(responsive('media:abc123'), null)
  assert.equal(responsive('https://cdn.example.com/shirt.jpg'), null)
  assert.equal(responsive('/images/logo.svg'), null)
  assert.equal(responsive(undefined), null)
})

test('every sizes hint names a real breakpoint', () => {
  // `srcset` without `sizes` does nothing — the browser assumes the image fills
  // the viewport and takes the largest candidate every time.
  for (const [name, value] of Object.entries(SIZES)) {
    assert.match(value, /\d+(vw|px)/, `SIZES.${name} has no width`)
  }
  assert.match(SIZES.card, /min-width/, 'a grid card must narrow on small screens')
})
