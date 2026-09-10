import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const { formatMoney } = await import(`${root}lib/money.js`)
const { docsLinkVisible } = await import(`${root}lib/docs-link.js`)

/* ── the specifications editor ─────────────────────────────────────────── */

/**
 * The round trip that ate its own input.
 *
 * Rows were derived from `enrichment.specs` and written back filtered, so "Add
 * specification" appended a blank row, the filter dropped it for having no key,
 * and the row vanished on the same tick. The button worked perfectly and did
 * nothing.
 */
function specEditor(initial = {}) {
  let rows = Object.entries(initial)
  let specs = { ...initial }
  const push = (next) => {
    rows = next
    const map = {}
    for (const [k, v] of next) if (k.trim()) map[k.trim()] = v
    specs = map
  }
  return {
    get rows() { return rows },
    get specs() { return specs },
    add: () => push([...rows, ['', '']]),
    edit: (i, idx, value) => push(rows.map((r, k) => (k === i ? (idx === 0 ? [value, r[1]] : [r[0], value]) : r))),
    remove: (i) => push(rows.filter((_, k) => k !== i)),
  }
}

test('adding a specification leaves a row you can type into', () => {
  const editor = specEditor()
  editor.add()
  assert.equal(editor.rows.length, 1, 'the blank row was filtered away before it could be used')
})

test('a half-typed row is held but not committed', () => {
  const editor = specEditor()
  editor.add()
  editor.edit(0, 0, 'collar_type')
  assert.deepEqual(editor.rows, [['collar_type', '']])
  assert.deepEqual(editor.specs, { collar_type: '' })
})

test('a second row can be added while the first is being edited', () => {
  const editor = specEditor({ sleeve: 'Full sleeve' })
  editor.add()
  editor.add()
  assert.equal(editor.rows.length, 3)
  assert.deepEqual(editor.specs, { sleeve: 'Full sleeve' }, 'blank rows must not reach the product')
})

test('a row with no key is dropped on commit, not on keystroke', () => {
  const editor = specEditor()
  editor.add()
  editor.edit(0, 1, 'Orphaned value')
  assert.equal(editor.rows.length, 1)
  assert.deepEqual(editor.specs, {})
})

/* ── delivery policy tokens ────────────────────────────────────────────── */

const renderPolicy = (config) => {
  const currency = config.pricing?.currency || 'USD'
  const values = {
    shipping: formatMoney({ amount: config.commerce?.shippingMethods?.[0]?.price ?? 0, currency }),
    freeOver: formatMoney({ amount: config.commerce?.freeShippingOver ?? 0, currency }),
    returnsDays: String(config.commerce?.returnsWindowDays ?? 30),
  }
  return (config.deliveryPolicy || []).map((line) => line.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole))
}

test('delivery copy takes its numbers from the settings the cart uses', async () => {
  const before = await api.getStorefront()
  assert.match(renderPolicy(before).join(' '), /30 days/)

  await api.adminUpdateSettings({
    commerce: { ...before.commerce, returnsWindowDays: 14, freeShippingOver: 9900 },
  })
  const after = renderPolicy(await api.getStorefront()).join(' ')
  assert.match(after, /14 days/)
  assert.match(after, /\$99\.00/)
})

test('an unknown token stays visible rather than blanking', async () => {
  // A {typo} you can see is a {typo} you can fix.
  await api.adminUpdateSettings({ deliveryPolicy: ['Ships in {returnsDays} days. A {typo} survives.'] })
  assert.match(renderPolicy(await api.getStorefront())[0], /\{typo\}/)
})

test('removing every paragraph renders no panel', async () => {
  await api.adminUpdateSettings({ deliveryPolicy: [] })
  assert.deepEqual(renderPolicy(await api.getStorefront()), [])
})

/* ── the lightbox ──────────────────────────────────────────────────────── */

const MAX_ZOOM = 3
const wrap = (i, delta, n) => (i + delta + n) % n
const zoomTo = (z) => Math.min(MAX_ZOOM, Math.max(1, z))
const clampPan = (pan, zoom, box) => {
  const maxX = (box.width * (zoom - 1)) / 2
  const maxY = (box.height * (zoom - 1)) / 2
  return { x: Math.min(maxX, Math.max(-maxX, pan.x)), y: Math.min(maxY, Math.max(-maxY, pan.y)) }
}

/**
 * `Math.min(0, -0)` is `-0`, and `deepStrictEqual` treats that as a different
 * value from `0`. It is not: `translate(0px, -0px)` and `translate(0px, 0px)`
 * are the same declaration. Normalising here rather than in the component,
 * because the component is correct and the assertion was the thing being fussy.
 */
const pan = (p) => ({ x: p.x + 0, y: p.y + 0 })

test('the gallery wraps in both directions', () => {
  assert.equal(wrap(2, 1, 3), 0)
  assert.equal(wrap(0, -1, 3), 2)
  assert.equal(wrap(0, 1, 1), 0)
})

test('zoom is bounded', () => {
  assert.equal(zoomTo(0.5), 1)
  assert.equal(zoomTo(9), MAX_ZOOM)
  assert.equal(zoomTo(2), 2)
})

test('pan cannot leave the image behind', () => {
  // Unclamped panning is how a zoomed photo becomes an empty field with a
  // sleeve in the corner and no obvious way back.
  const box = { width: 400, height: 500 }
  assert.deepEqual(pan(clampPan({ x: 999, y: -999 }, 1, box)), { x: 0, y: 0 })
  assert.deepEqual(pan(clampPan({ x: 999, y: -999 }, 2, box)), { x: 200, y: -250 })
  assert.deepEqual(pan(clampPan({ x: 50, y: -30 }, 2, box)), { x: 50, y: -30 })
  assert.deepEqual(pan(clampPan({ x: 200, y: 250 }, 1.5, box)), { x: 100, y: 125 })
})

/* ── who is offered the documentation ──────────────────────────────────── */

/**
 * The footer, the mobile menu and the demo pill all ask this, and they have to
 * agree — a merchant who switches it off and still finds it in one of the three
 * has been told the setting works when it does not.
 *
 * The default is not "on". It is "on while this is a demo": a shop with real
 * customers, running against a real backend, should not offer them an API
 * reference next to its returns policy.
 */
test('the docs link follows the setting, and defaults to demo-only', () => {
  const on = { features: { docsLink: true } }
  const off = { features: { docsLink: false } }
  const auto = { features: { docsLink: 'auto' } }

  assert.equal(docsLinkVisible(auto, true), true, 'a demo should offer its documentation')
  assert.equal(docsLinkVisible(auto, false), false, 'a live shop should not')
  assert.equal(docsLinkVisible({}, false), false, 'an absent setting means auto, not on')
  assert.equal(docsLinkVisible(undefined, true), true, 'and it must survive a config that has not loaded')

  assert.equal(docsLinkVisible(on, false), true, 'an explicit yes wins against a live API')
  assert.equal(docsLinkVisible(off, true), false, 'an explicit no wins on a demo')
})
