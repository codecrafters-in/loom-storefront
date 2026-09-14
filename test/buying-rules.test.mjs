import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampQuantity, ruleOf, stepperProps, stockNote, unitLabel } from '../src/lib/quantity.js'
import { cartProblem, lineDetails, nestLines } from '../src/lib/cart-lines.js'

/*
 * Quantity rules, stock wording and bag lines.
 *
 * Each of these was a constant once — one to ninety-nine, "Only N left" at
 * three, two option names under a title — and each constant was a promise the
 * server could break.
 */

test('an older backend gets one at a time, as before', () => {
  assert.deepEqual(ruleOf(undefined), { min: 1, max: null, step: 1, unit: '', decimals: false })
  assert.deepEqual(stepperProps(undefined), { min: 1, max: 99, step: 1, unit: '' })
})

test('coffee by the quarter kilo: steps from the minimum, decimals kept, capped by the rule', () => {
  const rule = { min: 0.25, max: 5, step: 0.25, unit: 'kg', decimals: true }
  assert.equal(clampQuantity(0.6, rule), 0.5)
  assert.equal(clampQuantity(0.25 + 0.25 + 0.25, rule), 0.75, 'no floating-point tail reaches the server')
  assert.equal(clampQuantity(9, rule), 5)
  assert.equal(clampQuantity(0, rule), 0.25)
  assert.equal(unitLabel(rule), 'kg')
})

test('a whole-number rule never offers a fraction, and stock caps the stepper', () => {
  const rule = { min: 1, max: 2, step: 1, unit: 'Units', decimals: false }
  assert.equal(clampQuantity(1.4, rule), 1)
  assert.equal(unitLabel(rule), '', '"2 Units" beside a stepper that says 2 is noise')
  assert.equal(stepperProps(rule, 1).max, 1)
  assert.equal(stepperProps({ min: 2, step: 2 }, 1).max, 2, 'the cap never goes below the minimum')
})

const variant = (inventory, available = inventory > 0) => ({ inventory, available })

test('stock: exact says the number, low only under the threshold, hidden never', () => {
  assert.deepEqual(stockNote({ stock: { display: 'exact', lowThreshold: 5 } }, variant(12)), { low: false, text: '12 in stock' })
  assert.equal(stockNote({ stock: { display: 'low', lowThreshold: 5 } }, variant(12)), null)
  assert.deepEqual(stockNote({ stock: { display: 'low', lowThreshold: 5 } }, variant(4)), { low: true, text: 'Only 4 left' })
  assert.equal(stockNote({ stock: { display: 'hidden', lowThreshold: 5 } }, variant(1)), null)
  assert.equal(stockNote({ stock: { display: 'exact' } }, variant(null, true)), null, 'inventory: null means the store does not say')
  assert.equal(stockNote({ stock: { display: 'exact' } }, variant(0)), null)
})

test('stock: the store setting stands in for a product without one, and the old default is three', () => {
  assert.equal(stockNote({}, variant(2), { display: 'hidden', lowThreshold: 9 }), null)
  assert.deepEqual(stockNote({}, variant(3)), { low: true, text: 'Only 3 left' })
  assert.equal(stockNote({}, variant(4)), null)
})

test('an optional product sits under the line it was bought with', () => {
  const lines = [
    { id: 'phone' }, { id: 'pen' }, { id: 'case', linkedTo: 'phone' }, { id: 'orphan', linkedTo: 'gone' },
  ]
  assert.deepEqual(nestLines(lines).map(({ line, depth }) => [line.id, depth]), [
    ['phone', 0], ['case', 1], ['pen', 0], ['orphan', 0],
  ])
  assert.equal(nestLines([{ id: 'a', linkedTo: 'b' }, { id: 'b', linkedTo: 'a' }]).length, 2, 'a cycle still shows both lines')
})

test('a line says its options, its extras, the text typed and a set’s contents', () => {
  const details = lineDetails({
    options: { Finish: 'Blackened' },
    extraOptions: { Engraving: 'Initials', 'Add-ons': ['Gift box', 'Refills'] },
    customValues: [{ name: 'Initials', text: 'J.S.' }],
    comboItems: [{ title: 'Brass Pocket Pen', options: { Finish: 'Raw brass' }, quantity: 1 }, { title: 'Field Notebook', options: {}, quantity: 1 }],
  })
  assert.equal(details.summary, 'Finish: Blackened  ·  Engraving: Initials  ·  Add-ons: Gift box, Refills')
  assert.deepEqual(details.custom, ['Initials: “J.S.”'])
  assert.deepEqual(details.combo, ['Brass Pocket Pen (Raw brass)', 'Field Notebook'])
  assert.deepEqual(lineDetails({ options: {} }), { summary: '', custom: [], combo: [] })
})

const refusal = (code, detail, message = 'POST /carts/c/lines failed with 422.') => Object.assign(new Error(message), { code, detail })

test('a refused line says what to do, from the code and its detail', () => {
  assert.equal(cartProblem(refusal('choose_options', { missing: ['Storage', 'Color'] })), 'Choose Storage and Color first.')
  assert.equal(cartProblem(refusal('combo_incomplete', { groups: ['Pen'] })), 'Choose one for Pen.')
  assert.equal(
    cartProblem(refusal('quantity_rule', { min: 0.25, max: 5, step: 0.25 })),
    'That quantity is not available: buy at least 0.25, at most 5 and in steps of 0.25.',
  )
  assert.match(cartProblem(refusal('invalid_combination', {})), /not available/)
})

test('the server’s own sentence wins, and the http adapter’s nested detail is read too', () => {
  const fromServer = refusal('choose_options', { message: 'Choisissez le stockage.', code: 'choose_options', detail: { missing: ['Stockage'] } }, 'Choisissez le stockage.')
  assert.equal(cartProblem(fromServer), 'Choisissez le stockage.')
  const bare = refusal('choose_options', { code: 'choose_options', detail: { missing: ['Storage'] } })
  assert.equal(cartProblem(bare), 'Choose Storage first.')
  assert.equal(cartProblem(refusal('out_of_stock', {}, 'Sold out.')), 'Sold out.')
})
