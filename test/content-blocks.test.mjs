import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const { blockParts, groupBlocks } = await import(`${root}lib/page-blocks.js`)
const { srcsetOf } = await import(`${root}lib/images.js`)
const { repairsLine } = await import(`${root}lib/trust.js`)
const { fieldErrors } = await import(`${root}lib/errors.js`)
const { prefillContact } = await import(`${root}lib/prefill.js`)

/*
 * Store pages, the contact form and the repairs line.
 *
 * A question lost its image and table, a contact form's text was not shown and its heading stayed when the form was
 * off, the form ignored which fields the backend refused, and the repairs line was a clothing shop's sentence.
 */

test('a question keeps its image and table, in the order a page block has them', () => {
  const fit = { type: 'faq', h: 'How do the trousers fit?', p: 'True to size.', table: [['Size', 'Waist'], ['M', '82']], image: { url: 'https://x.test/fit.jpg' } }
  const [group] = groupBlocks([fit, { type: 'faq', h: 'Care?', p: 'Cold wash.' }])
  assert.equal(group.type, 'faq-group')
  assert.equal(group.items.length, 2)
  assert.deepEqual(blockParts(group.items[0]), ['heading', 'image', 'text', 'table'])
  assert.deepEqual(blockParts(group.items[1]), ['heading', 'text'])
  assert.deepEqual(blockParts({ type: 'image', image: { url: '' } }), [])
})

test('an image block can come in sizes, as product photographs do', () => {
  const block = { type: 'image', h: 'The workshop', image: { url: 'https://x.test/w.jpg', srcset: [{ width: 512, url: 'https://x.test/w-512.jpg' }, { width: 1024, url: 'https://x.test/w.jpg' }] } }
  assert.deepEqual(blockParts(block), ['heading', 'image'])
  assert.equal(srcsetOf(block.image.srcset), 'https://x.test/w-512.jpg 512w, https://x.test/w.jpg 1024w')
})

test('a contact form block: its text above the form, and nothing at all with the form off', () => {
  const block = { type: 'contact-form', h: 'Send us a message', p: 'We answer within a day.' }
  assert.deepEqual(blockParts(block, { contactForm: true }), ['heading', 'text', 'form'])
  assert.deepEqual(blockParts(block, {}), ['heading', 'text', 'form'], 'on unless switched off')
  assert.deepEqual(blockParts(block, { contactForm: false }), [], 'no heading over an empty space')
  assert.deepEqual(blockParts({ type: 'contact', h: 'Visit us', html: '<p>Open daily</p>' }, { contactForm: false }), ['heading', 'text', 'contact'])
})

test('a 422 names the fields to mark, from Odoo and from the demo backend', async () => {
  const odoo = { status: 422, detail: { code: 'missing_fields', message: 'Please…', detail: { fields: ['name', 'message'] } } }
  assert.deepEqual([...fieldErrors(odoo)], ['name', 'message'])
  assert.equal(fieldErrors({ status: 500, detail: { detail: { fields: ['name'] } } }).size, 0)
  assert.equal(fieldErrors({ status: 422, detail: { fields: 'name' } }).size, 0)
  assert.equal(fieldErrors(null).size, 0)
  const error = await api.sendContact({ name: 'Asha', email: ' ', message: '' }).catch((err) => err)
  assert.equal(error.status, 422)
  assert.deepEqual([...fieldErrors(error)], ['email', 'message'])
})

test("a signed-in customer's name and email fill the contact form, never over what was typed", () => {
  const empty = { name: '', email: '', message: '' }
  assert.deepEqual(prefillContact(empty, { firstName: 'Asha', lastName: 'Patel', email: 'asha@example.com' }), { name: 'Asha Patel', email: 'asha@example.com', message: '' })
  assert.equal(prefillContact(empty, { name: 'A. Patel', email: 'a@example.com' }).name, 'A. Patel')
  assert.deepEqual(prefillContact({ ...empty, name: 'Typed' }, { name: 'Asha', email: 'a@example.com' }), { name: 'Typed', email: 'a@example.com', message: '' })
  assert.equal(prefillContact(empty, null), empty)
})

test("the repairs line is the store's own sentence when it sends one", () => {
  assert.equal(repairsLine({ repairs: false, repairsText: 'Free screen repairs' }), null)
  assert.equal(repairsLine(undefined), null)
  assert.deepEqual(repairsLine({ repairs: true, repairsText: 'Free screen repairs for two years' }), { strong: 'Free screen repairs for two years', rest: '' })
  assert.deepEqual(repairsLine({ repairs: true }), { strong: 'Repaired, not replaced', rest: 'we mend anything we made, for as long as we exist' })
  assert.equal(repairsLine({ repairs: true, repairsText: '   ' }).strong, 'Repaired, not replaced')
})
