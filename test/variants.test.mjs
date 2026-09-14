import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  choiceIdsOf, choiceState, comboState, extrasOf, extrasTotal, galleryFor, initialCombo, initialExtras,
  initialSelection, isComplete, missingOption, missingText, modelOf, optionsOf, pick, priceFor,
  selectionLabel, speaksChoices, toggleExtra, variantFor,
} from '../src/lib/variants.js'

/*
 * The generic picker, without a browser.
 *
 * Every product the theme can sell passes through these functions: no options,
 * one, two, three, a combination that was never made, a combination nobody has
 * bought yet. The picker used to be correct for exactly one of those, and the
 * rest were a button that never enabled.
 */

const usd = (amount) => ({ amount, currency: 'USD' })

/** A variant, shaped the way a Phase 2 backend sends one. */
const v = (id, optionIds, { price = 1000, inventory = 5, options = {} } = {}) => ({
  id, optionIds, options, price: usd(price), compareAtPrice: null, inventory, available: inventory > 0,
})

const choice = (id, name, extra = {}) => ({ id, name, color: null, image: null, priceExtra: null, custom: false, ...extra })

/** Storage × Colour, with 512 GB never made in Sage and 128 GB Silver sold out. */
const phone = {
  slug: 'phone',
  price: usd(69900),
  options: [
    { id: '1', name: 'Storage', displayType: 'pills', role: null, imagesFollow: false, mode: 'variant',
      choices: [choice('s128', '128 GB'), choice('s256', '256 GB'), choice('s512', '512 GB')] },
    { id: '2', name: 'Color', displayType: 'color', role: 'color', imagesFollow: true, mode: 'variant',
      choices: [choice('graphite', 'Graphite'), choice('silver', 'Silver'), choice('sage', 'Sage')] },
  ],
  variants: [
    v('p1', { 1: 's128', 2: 'graphite' }, { price: 69900 }),
    v('p2', { 1: 's128', 2: 'silver' }, { price: 69900, inventory: 0 }),
    v('p3', { 1: 's128', 2: 'sage' }, { price: 69900 }),
    v('p4', { 1: 's256', 2: 'graphite' }, { price: 79900 }),
    v('p5', { 1: 's256', 2: 'silver' }, { price: 79900 }),
    v('p6', { 1: 's256', 2: 'sage' }, { price: 79900 }),
    v('p7', { 1: 's512', 2: 'graphite' }, { price: 99900 }),
    v('p8', { 1: 's512', 2: 'silver' }, { price: 99900 }),
  ],
  images: [
    { id: 'g', url: '/g.svg', alt: 'Graphite', color: 'Graphite' },
    { id: 'detail', url: '/d.svg', alt: 'Detail' },
    { id: 's', url: '/s.svg', alt: 'Silver', color: 'Silver' },
  ],
}

test('a product with no options is complete, and buyable, from the first render', () => {
  const notebook = { options: [], variants: [v('n1', {}, { price: 1800 })] }
  const model = modelOf(notebook)
  const selection = initialSelection(model)
  assert.equal(isComplete(model, selection), true)
  assert.equal(variantFor(model, selection)?.id, 'n1')
  assert.equal(missingOption(model, selection), null)
  assert.deepEqual(choiceIdsOf(model, selection), [])
  assert.equal(priceFor(model, selection, notebook).price.amount, 1800)
})

test('an option with a single choice is chosen for the shopper', () => {
  const beanie = {
    options: [{ id: 'size', name: 'Size', choices: [choice('one', 'One Size')] }],
    variants: [v('b1', { size: 'one' })],
  }
  const model = modelOf(beanie)
  assert.equal(variantFor(model, initialSelection(model))?.id, 'b1', 'nobody should have to press "One Size"')
})

test('one option: the button names it until it is chosen', () => {
  const pen = {
    options: [{ id: 'finish', name: 'Finish', displayType: 'radio', choices: [choice('raw', 'Raw brass'), choice('black', 'Blackened')] }],
    variants: [v('raw', { finish: 'raw' }, { price: 2800 }), v('black', { finish: 'black' }, { price: 3400 })],
  }
  const model = modelOf(pen)
  const start = initialSelection(model)
  assert.equal(missingOption(model, start)?.name, 'Finish')
  assert.deepEqual(priceFor(model, start, pen), { price: usd(2800), to: usd(3400) }, 'a range until the price is settled')
  const chosen = pick(model, start, 'finish', 'black')
  assert.equal(variantFor(model, chosen)?.id, 'black')
  assert.equal(priceFor(model, chosen, pen).price.amount, 3400)
})

test('two options: the gallery option starts on its first buyable choice, the other waits', () => {
  const model = modelOf(phone)
  const start = initialSelection(model)
  assert.deepEqual(start, { 2: 'graphite' })
  assert.equal(missingOption(model, start)?.name, 'Storage')
  assert.equal(variantFor(model, start), null)
})

test('never made and sold out are different answers', () => {
  const model = modelOf(phone)
  const at512 = pick(model, {}, '1', 's512')
  assert.equal(choiceState(model, at512, 1, 'sage'), 'absent', '512 GB was never made in Sage')
  const at128 = pick(model, {}, '1', 's128')
  assert.equal(choiceState(model, at128, 1, 'silver'), 'sold-out')
  assert.equal(choiceState(model, at128, 1, 'graphite'), 'available')
})

test('choices are judged against the options before them, so the first option is always open', () => {
  const model = modelOf(phone)
  // Sage is chosen; 512 GB does not exist in Sage, but Storage comes first and must not strike it.
  assert.equal(choiceState(model, { 2: 'sage' }, 0, 's512'), 'available')
})

test('changing an earlier option keeps a later choice that still works, and moves the gallery option when it does not', () => {
  const model = modelOf(phone)
  const sage256 = { 1: 's256', 2: 'sage' }
  assert.deepEqual(pick(model, sage256, '1', 's128'), { 1: 's128', 2: 'sage' }, 'Sage exists in 128 GB, so it stays')
  const moved = pick(model, sage256, '1', 's512')
  assert.equal(moved[1], 's512')
  assert.equal(moved[2], 'graphite', 'the photographed option moves to a colour that exists, rather than to nothing')
})

test('a later option without a gallery is cleared when the new combination does not exist', () => {
  const shirt = {
    options: [
      { name: 'Color', values: ['White', 'Navy'] },
      { name: 'Size', values: ['S', 'M'] },
    ],
    swatches: { White: '#fff', Navy: '#223' },
    variants: [
      { id: 'w-s', options: { Color: 'White', Size: 'S' }, price: usd(100), inventory: 2, available: true },
      { id: 'w-m', options: { Color: 'White', Size: 'M' }, price: usd(100), inventory: 2, available: true },
      { id: 'n-s', options: { Color: 'Navy', Size: 'S' }, price: usd(100), inventory: 2, available: true },
    ],
  }
  const model = modelOf(shirt)
  const whiteM = pick(model, initialSelection(model), 'Size', 'Size:M')
  assert.equal(variantFor(model, whiteM)?.id, 'w-m')
  const navy = pick(model, whiteM, 'Color', 'Color:Navy')
  assert.equal(navy.Size, undefined, 'M is not made in navy, so the size goes')
  assert.equal(missingOption(model, navy)?.name, 'Size')
})

test('an older backend: option names and value names still resolve, with the colour and size roles', () => {
  const options = optionsOf({ options: [{ name: 'Color', values: ['Ecru'] }, { name: 'Size', values: ['M'] }], swatches: { Ecru: '#EDE6D8' } })
  assert.deepEqual(options.map((o) => [o.id, o.role, o.displayType, o.imagesFollow]), [
    ['Color', 'color', 'color', true],
    ['Size', 'size', 'pills', false],
  ])
  assert.equal(options[0].choices[0].color, '#EDE6D8')
  assert.equal(speaksChoices({ variants: [{ id: 'x', options: { Color: 'Ecru' } }] }), false, 'no optionIds: send variant_id')
  assert.equal(speaksChoices({ variants: [{ id: 'x', optionIds: {} }] }), true)
})

test('three options, with an excluded combination in the middle', () => {
  const choices = (id, names) => ({ id, name: id, choices: names.map((n) => choice(`${id}-${n}`, n)) })
  const watch = {
    options: [choices('case', ['40', '44']), choices('band', ['Leather', 'Steel']), choices('colour', ['Gold', 'Black'])],
    variants: [
      v('a', { case: 'case-40', band: 'band-Leather', colour: 'colour-Gold' }),
      v('b', { case: 'case-40', band: 'band-Steel', colour: 'colour-Black' }),
      v('c', { case: 'case-44', band: 'band-Steel', colour: 'colour-Gold' }, { inventory: 0 }),
    ],
  }
  const model = modelOf(watch)
  let s = pick(model, {}, 'case', 'case-40')
  assert.equal(choiceState(model, s, 1, 'band-Leather'), 'available')
  s = pick(model, s, 'band', 'band-Steel')
  assert.equal(choiceState(model, s, 2, 'colour-Gold'), 'absent', '40 mm steel is only made in black')
  s = pick(model, s, 'colour', 'colour-Black')
  assert.equal(variantFor(model, s)?.id, 'b')
  assert.equal(selectionLabel(model, s), '40 · Steel · Black')
  assert.equal(choiceState(model, pick(model, {}, 'case', 'case-44'), 1, 'band-Steel'), 'sold-out')
})

test('a dynamic option: a combination nobody has bought yet is offered, and only the server can price it', () => {
  const coffee = {
    price: usd(3200),
    options: [{ id: 'grind', name: 'Grind', displayType: 'select', mode: 'dynamic',
      choices: [choice('whole', 'Whole bean'), choice('espresso', 'Espresso')] }],
    variants: [v('whole', { grind: 'whole' }, { price: 3200 })],
  }
  const model = modelOf(coffee)
  assert.equal(model.dynamic, true)
  assert.equal(choiceState(model, {}, 0, 'espresso'), 'unknown')
  const espresso = pick(model, {}, 'grind', 'espresso')
  assert.equal(isComplete(model, espresso), true)
  assert.equal(variantFor(model, espresso), null, 'not in variants[] — POST /products/:slug/combination prices it')
})

test('a restored variant id restores the whole selection', () => {
  const model = modelOf(phone)
  assert.deepEqual(initialSelection(model, 'p5'), { 1: 's256', 2: 'silver' })
})

test('the gallery follows the chosen colour and keeps the shared shots', () => {
  const model = modelOf(phone)
  assert.deepEqual(galleryFor(phone, model, { 2: 'silver' }).map((i) => i.id), ['s', 'detail'])
  assert.deepEqual(galleryFor(phone, model, {}).map((i) => i.id), ['g', 'detail', 's'], 'nothing chosen: every image')
})

test('extra options: a required radio starts chosen, checkboxes add up, typed text is required', () => {
  const pen = {
    options: [],
    variants: [v('pen', {}, { price: 2800 })],
    extraOptions: [
      { id: 7, name: 'Engraving', displayType: 'radio', multiple: false, required: true,
        choices: [choice(70, 'No engraving'), choice(71, 'Initials', { priceExtra: usd(1200), custom: true })] },
      { id: 8, name: 'Add-ons', displayType: 'pills', multiple: true, required: false,
        choices: [choice(80, 'Gift box', { priceExtra: usd(500) }), choice(81, 'Refills', { priceExtra: usd(400) })] },
    ],
  }
  const model = modelOf(pen)
  const extras = extrasOf(pen)
  let state = initialExtras(extras)
  assert.deepEqual(state, { 7: ['70'], 8: [] })
  state = toggleExtra(extras, state, '7', '71')
  state = toggleExtra(extras, state, '8', '80')
  state = toggleExtra(extras, state, '8', '81')
  assert.deepEqual(state, { 7: ['71'], 8: ['80', '81'] })
  assert.equal(extrasTotal(extras, state), 2100)
  assert.equal(priceFor(model, {}, pen, extrasTotal(extras, state)).price.amount, 4900)
  assert.deepEqual(missingText(model, {}, extras, state, {}).map((c) => c.name), ['Initials'])
  assert.deepEqual(missingText(model, {}, extras, state, { 71: 'JS' }), [])
  state = toggleExtra(extras, state, '8', '80')
  assert.deepEqual(state[8], ['81'], 'a checkbox unticks')
})

test('a combo: single-item groups are chosen, the rest are named until picked', () => {
  const groups = [
    { id: 'pen', name: 'Pen', items: [{ id: 'raw', extraPrice: usd(0), available: true }, { id: 'black', extraPrice: usd(600), available: true }] },
    { id: 'book', name: 'Notebook', items: [{ id: 'dot', extraPrice: usd(0), available: true }] },
  ]
  const picks = initialCombo(groups)
  assert.deepEqual(picks, { book: 'dot' })
  assert.deepEqual(comboState(groups, picks).missing.map((g) => g.name), ['Pen'])
  const done = comboState(groups, { ...picks, pen: 'black' })
  assert.equal(done.complete, true)
  assert.equal(done.extra, 600)
})
