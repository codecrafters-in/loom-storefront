import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp, reset } from './helpers/browser.mjs'

/*
 * The demo backend selling things that are not clothes.
 *
 * The mock is the public demo and the reference a backend is built against, so
 * it has to answer the Phase 2 contract the way docs/API.md says Odoo does:
 * choices by id, combinations priced on request, extras and typed text on a
 * line, quantity rules, sets, accessories linked to their line, and files on a
 * paid order.
 */

const app = await loadApp()
const { api } = app

const rejects = async (promise, code) => {
  try {
    await promise
  } catch (err) {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`)
    return err
  }
  assert.fail(`expected ${code}, but it resolved`)
}

test('a product arrives in the current contract, whichever way it was authored', async () => {
  const phone = await api.getProduct('nova-phone')
  assert.equal(phone.type, 'goods')
  assert.deepEqual(phone.options.map((o) => [o.id, o.name, o.role, o.displayType]), [
    ['storage', 'Storage', null, 'pills'],
    ['color', 'Color', 'color', 'color'],
  ])
  assert.deepEqual(phone.variants[0].optionIds, { storage: 'storage-128', color: 'color-graphite' })
  assert.equal(phone.brand.slug, 'nova')
  assert.deepEqual(phone.breadcrumbs.map((b) => b.name), ['Goods', 'Tech', 'Phones'], 'names, root to leaf, any depth')
  assert.deepEqual(phone.optionalProducts.map((p) => Object.keys(p).sort()), [
    ['available', 'compareAtPrice', 'image', 'price', 'slug', 'title', 'type', 'variantId'],
  ])
  assert.equal(phone.optionalProducts[0].variantId, 'var_leather_phone_case', 'one variant: it can be added from the dialog')
  assert.equal((await api.getProduct('leather-phone-case')).accessories[0].variantId, null, 'a phone has choices to make first')
  assert.equal(phone.enrichment.specList[0].label, 'Screen size')
  assert.equal(phone.enrichment.specList[0].facet, undefined, 'the facet flag is this adapter’s, not the contract’s')

  const shirt = await api.getProduct('oxford-shirt-ecru')
  assert.equal(shirt.options[0].id, 'Color')
  assert.equal(shirt.options[0].choices[0].id, 'Color:Ecru')
  assert.equal(shirt.options[1].role, 'size')
  assert.deepEqual(shirt.variants[0].optionIds, { Color: 'Color:Ecru', Size: 'Size:XS' })
  assert.deepEqual(shirt.quantity, { min: 1, max: null, step: 1, unit: 'Units', decimals: false })
  assert.deepEqual(shirt.enrichment.labels, { fabric: 'Fabric & care', details: 'Construction' })
})

test('a store that hides stock levels does not send them', async () => {
  const coffee = await api.getProduct('house-coffee')
  assert.equal(coffee.stock.display, 'hidden')
  assert.equal(coffee.variants[0].inventory, null)
  assert.equal(coffee.variants[0].available, true)
})

test('combinations: dynamic ones are priced, extras add up, excluded and incomplete ones are refused', async () => {
  const espresso = await api.getCombination('house-coffee', ['grind-espresso'])
  assert.deepEqual([espresso.exists, espresso.variantId, espresso.available, espresso.price.amount], [false, null, true, 3200])
  assert.equal((await api.getCombination('house-coffee', ['grind-french-press'])).price.amount, 3400)
  const whole = await api.getCombination('house-coffee', ['grind-whole'])
  assert.equal(whole.exists, true)

  const engraved = await api.getCombination('brass-pen', ['finish-blackened', 'engraving-initials', 'add-gift-box'])
  assert.equal(engraved.price.amount, 3400 + 1200 + 500)

  await rejects(api.getCombination('nova-phone', ['storage-512', 'color-sage']), 'invalid_combination')
  await rejects(api.getCombination('nova-phone', ['storage-512']), 'invalid_combination')
  await rejects(api.getCombination('no-such-thing', []), 'not_found')
})

test('adding by choices: missing options are named, and the line is the variant chosen', async () => {
  await reset(app)
  const err = await rejects(api.addToCart({ productSlug: 'nova-phone', choiceIds: ['color-silver'], quantity: 1 }), 'choose_options')
  assert.deepEqual(err.detail.missing, ['Storage'])

  const cart = await api.addToCart({ productSlug: 'nova-phone', choiceIds: ['storage-256', 'color-silver'], quantity: 1 })
  assert.equal(cart.lines.length, 1)
  assert.deepEqual(cart.lines[0].options, { Storage: '256 GB', Color: 'Silver' })
  assert.equal(cart.lines[0].unitPrice.amount, 79900)
  assert.equal(cart.lines[0]._untracked, undefined, 'bookkeeping never leaves the adapter')
})

test('quantity rules are the server’s, on add and on update', async () => {
  await reset(app)
  const err = await rejects(api.addToCart({ productSlug: 'house-coffee', choiceIds: ['grind-filter'], quantity: 0.3 }), 'quantity_rule')
  assert.deepEqual(err.detail, { min: 0.25, max: 5, step: 0.25 })
  await rejects(api.addToCart({ productSlug: 'nova-phone', choiceIds: ['storage-128', 'color-sage'], quantity: 3 }), 'quantity_rule')

  const cart = await api.addToCart({ productSlug: 'house-coffee', choiceIds: ['grind-espresso'], quantity: 0.75 })
  const line = cart.lines[0]
  assert.equal(line.lineTotal.amount, 2400, 'three quarters of a kilo at $32')
  assert.deepEqual(line.quantityRule, { min: 0.25, max: 5, step: 0.25, unit: 'kg', decimals: true })
  await rejects(api.updateCartLine(line.id, 0.8), 'quantity_rule')
  const more = await api.updateCartLine(line.id, 1.25)
  assert.equal(more.subtotal.amount, 4000)
})

test('extras and typed text ride on the line, and text is kept to 200 characters', async () => {
  await reset(app)
  const body = {
    productSlug: 'brass-pen',
    choiceIds: ['finish-raw'],
    extraChoiceIds: ['engraving-initials', 'add-gift-box', 'add-refills'],
    customValues: [{ choiceId: 'engraving-initials', text: 'J.S.' }],
    quantity: 1,
  }
  await rejects(api.addToCart({ ...body, customValues: [{ choiceId: 'engraving-initials', text: 'x'.repeat(201) }] }), 'invalid_combination')
  const cart = await api.addToCart(body)
  const [line] = cart.lines
  assert.deepEqual(line.extraOptions, { Engraving: 'Initials', 'Add-ons': 'Gift box, Three spare refills' })
  assert.deepEqual(line.customValues, [{ name: 'Initials', text: 'J.S.' }])
  assert.equal(line.unitPrice.amount, 2800 + 1200 + 500 + 400)

  const again = await api.addToCart({ ...body, customValues: [{ choiceId: 'engraving-initials', text: 'A.B.' }] })
  assert.equal(again.lines.length, 2, 'different engraving, different line')
})

test('a combo needs one item from every group, and lists its contents on its line', async () => {
  await reset(app)
  const set = await api.getProduct('desk-set')
  assert.equal(set.type, 'combo')
  assert.deepEqual(set.combo.map((g) => g.name), ['Pen', 'Notebook'])
  assert.equal(set.combo[0].items[1].title, 'Brass Pocket Pen')

  const err = await rejects(api.addToCart({ productSlug: 'desk-set', choiceIds: [], comboItems: [{ comboItemId: 'combo-notebook-dot' }] }), 'combo_incomplete')
  assert.deepEqual(err.detail.groups, ['Pen'])

  const cart = await api.addToCart({
    productSlug: 'desk-set',
    choiceIds: [],
    comboItems: [{ comboItemId: 'combo-pen-blackened' }, { comboItemId: 'combo-notebook-dot' }],
    quantity: 2,
  })
  const [line] = cart.lines
  assert.equal(line.unitPrice.amount, 4400 + 600)
  assert.deepEqual(line.comboItems.map((i) => [i.title, i.options, i.quantity]), [
    ['Brass Pocket Pen', { Finish: 'Blackened' }, 2],
    ['Field Notebook', {}, 2],
  ])
})

test('an optional product is linked to its line, and leaves with it', async () => {
  await reset(app)
  const phone = await api.getProduct('nova-phone')
  const cart = await api.addToCart({
    productSlug: 'nova-phone',
    choiceIds: ['storage-128', 'color-graphite'],
    quantity: 1,
    optionalProducts: [{ variantId: phone.optionalProducts[0].variantId, quantity: 1 }],
  })
  const [main, extra] = cart.lines
  assert.equal(extra.linkedTo, main.id)
  assert.equal(main.linkedTo, null)
  const after = await api.removeCartLine(main.id)
  assert.equal(after.lines.length, 0)
})

test('listing filters: attribute, specification and brand, with generic facets', async () => {
  const bySlug = (res) => res.items.map((p) => p.slug).sort()
  assert.deepEqual(bySlug(await api.listProducts({ attr: ['storage:256 GB'], perPage: 50 })), ['nova-phone'])
  assert.deepEqual(bySlug(await api.listProducts({ spec: ['ruling:Dot grid'], perPage: 50 })), ['field-notebook'])
  assert.deepEqual(bySlug(await api.listProducts({ brand: ['field-office'], perPage: 50 })), ['brass-pen', 'desk-set', 'field-notebook'])
  const navyM = bySlug(await api.listProducts({ attr: ['Color:Navy', 'Size:M'], perPage: 50 }))
  assert.ok(navyM.length > 0 && navyM.every((slug) => !['nova-phone', 'field-notebook'].includes(slug)))

  const { facets } = await api.listProducts({ category: 'goods', perPage: 50 })
  assert.ok(facets.attributes.some((a) => a.name === 'Storage' && a.values.some((v) => v.name === '512 GB' && v.count === 1)))
  assert.ok(facets.specs.some((s) => s.key === 'ruling' && s.label === 'Ruling' && s.unit === null))
  assert.equal(facets.specs.find((s) => s.key === 'screen_size').unit, 'in')
  assert.deepEqual(facets.brands.map((b) => b.slug), ['field-office', 'north-roast', 'nova'])
  assert.ok(facets.priceRange && Array.isArray(facets.sizes), 'the older facets stay')
})

test('categories nest to any depth and carry their path; brands list and 404', async () => {
  const { items } = await api.listCategories()
  const goods = items.find((c) => c.slug === 'goods')
  const phones = goods.children.find((c) => c.slug === 'goods-tech').children.find((c) => c.slug === 'goods-tech-phones')
  assert.deepEqual(phones.path.map((p) => p.name), ['Goods', 'Tech', 'Phones'])
  assert.equal(goods.count, 7)

  const brands = await api.listBrands()
  assert.equal(brands.items.find((b) => b.slug === 'nova').count, 2 - 1, 'the case has no brand; only the phone is Nova')
  assert.equal((await api.getBrand('north-roast')).seo.title, 'North Roast coffee')
  await rejects(api.getBrand('nobody'), 'not_found')
})

test('a paid order with a digital product lists its download', async () => {
  await reset(app)
  const handbook = await api.getProduct('garment-care-handbook')
  await api.addToCart({ productSlug: handbook.slug, choiceIds: [], quantity: 1 })
  const order = await api.checkout({
    email: 'reader@example.com',
    shippingAddress: { name: 'R', line1: '1 Road', city: 'Leeds', postalCode: 'LS1', country: 'GB' },
  })
  assert.deepEqual(order.downloads.map((d) => [d.name, d.url]), [['Garment Care Handbook (PDF)', '/downloads/garment-care-handbook.pdf']])
  assert.equal((await api.getOrder(order.id)).downloads.length, 1)
})
