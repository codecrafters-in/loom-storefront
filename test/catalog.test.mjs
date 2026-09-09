import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const { attributes, attributeByKey } = await import(`${root}data/attributes.js`)
const { items: all } = await api.listProducts({ perPage: 200 })

test('the demo catalogue is not half-enriched', async () => {
  // Half a catalogue with rich enrichment and half with none looks like a bug
  // rather than an editorial choice, and it is the state a migration arrives in.
  for (const card of all) {
    const p = await api.getProduct(card.slug)
    const e = p.enrichment || {}
    assert.ok(e.highlights?.length, `${p.slug} has no highlights`)
    assert.ok(e.features?.length, `${p.slug} has no feature cards`)
    assert.ok(Object.keys(e.specs || {}).length, `${p.slug} has no specifications`)
    assert.ok(e.assurances?.length, `${p.slug} has no service rows`)
    assert.ok(e.manufacturer, `${p.slug} has no compliance block`)
  }
})

test('highlights stay inside the cap and the vocabulary', async () => {
  for (const card of all) {
    const { enrichment: e } = await api.getProduct(card.slug)
    assert.ok(e.highlights.length <= 6, `${card.slug} has ${e.highlights.length} highlights`)
    for (const h of e.highlights) {
      assert.ok(attributeByKey[h.key], `${card.slug}: "${h.key}" is off-vocabulary`)
      assert.ok(String(h.value).trim(), `${card.slug}: "${h.key}" has no value`)
    }
  }
})

test('every region named on a product agrees with every other', async () => {
  const PLACES = ['Italy', 'Portugal', 'Belgium', 'Japan', 'India', 'Bangladesh', 'Vietnam',
    'Peru', 'England', 'Scotland', 'Türkiye', 'United Kingdom']
  const uk = (list) => list.map((x) => (x === 'Scotland' || x === 'England' ? 'United Kingdom' : x))
  const placesIn = (text) => PLACES.filter((x) => text.includes(x))

  for (const card of all) {
    const p = await api.getProduct(card.slug)
    const origin = p.fabric?.origin
    if (!origin) continue
    const country = p.enrichment.manufacturer?.countryOfOrigin
    const last = origin.split(',').pop().trim()

    assert.notEqual(country, 'See product specifications', `${p.slug} shrugs at country of origin`)
    assert.ok(
      country === last || (['Scotland', 'England', 'Scottish Borders'].includes(last) && country === 'United Kingdom'),
      `${p.slug}: origin "${origin}" vs country "${country}"`,
    )
    if (p.enrichment.maker?.location) {
      assert.equal(p.enrichment.maker.location, origin, `${p.slug}: mill is not where the cloth is`)
    }
    // A construction bullet may be vaguer ("Northern Italy") but must not name
    // a different country.
    for (const detail of p.details || []) {
      if (!/(?:Woven|Made|Knitted|Spun|Cut) in /.test(detail)) continue
      const a = placesIn(detail)
      const b = placesIn(origin)
      if (a.length && b.length) {
        assert.ok(uk(a).some((x) => uk(b).includes(x)), `${p.slug}: "${detail}" vs "${origin}"`)
      }
    }
  }
})

test('a maker location never appears without a name', async () => {
  for (const card of all) {
    const { maker } = (await api.getProduct(card.slug)).enrichment
    if (maker) assert.ok(maker.name, `${card.slug} has a mill location and no mill`)
  }
})

test('every colour has its own first photograph, and the file exists', async () => {
  // The gallery scoping code was correct for a long time and had nothing to
  // scope, because every variant pointed at the same shot.
  for (const card of all) {
    const p = await api.getProduct(card.slug)
    const colors = p.options.find((o) => o.name === 'Color')?.values || []
    const firstShots = new Set()

    for (const color of colors) {
      const tagged = p.images.filter((i) => i.color === color)
      const shared = p.images.filter((i) => !i.color)
      const gallery = [...tagged, ...shared].length ? [...tagged, ...shared] : p.images
      const variant = p.variants.find((v) => v.options.Color === color)

      assert.ok(gallery.length, `${p.slug}/${color}: empty gallery`)
      assert.equal(
        gallery.findIndex((img) => img.id === variant?.imageId),
        0,
        `${p.slug}/${color}: the variant's image is not the first one shown`,
      )
      assert.ok(gallery[0].alt, `${p.slug}/${color}: first shot has no alt text`)
      assert.ok(
        fs.existsSync(new URL(`../public${gallery[0].url}`, import.meta.url)),
        `${p.slug}/${color}: ${gallery[0].url} is missing`,
      )
      firstShots.add(gallery[0].id)
    }

    if (colors.length > 1) {
      assert.equal(firstShots.size, colors.length, `${p.slug}: colours share a first shot`)
    }
  }
})

test('the image strip picks facts a shopper cannot already see', async () => {
  const STRIP_MAX = 28
  for (const card of all) {
    const { enrichment: e } = await api.getProduct(card.slug)
    const seen = new Set((e.highlights || []).map((h) => h.key))
    const rows = attributes
      .filter((a) => e.specs?.[a.key])
      .map((a) => ({ key: a.key, value: a.unit ? `${e.specs[a.key]} ${a.unit}` : String(e.specs[a.key]) }))
      .filter((r) => r.value.length <= STRIP_MAX)
    const fresh = rows.filter((r) => !seen.has(r.key))
    const shown = (fresh.length >= 3 ? fresh : rows).slice(0, 4)

    // An overlay that appears on some products and not others reads as a bug.
    assert.ok(shown.length >= 2, `${card.slug}: the strip would hide (${shown.length} rows)`)
    for (const r of shown) assert.ok(r.value.length <= STRIP_MAX, `${card.slug}: "${r.value}" is too long`)
  }
})

test('a sale badge needs a real discount behind it', async () => {
  for (const card of all) {
    const p = await api.getProduct(card.slug)
    if (!p.badges.includes('sale')) continue
    const pct = Math.round(((p.compareAtPrice.amount - p.price.amount) / p.compareAtPrice.amount) * 100)
    assert.ok(pct >= 5, `${p.slug} is badged sale at ${pct}%`)
  }
})
