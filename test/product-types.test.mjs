import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadApp } from './helpers/browser.mjs'

const { api, root } = await loadApp()
const T = await import(`${root}lib/product-types.js`)

/*
 * The product editor follows the product's type: which tabs and panels exist,
 * what they are called, which options it can have and which specifications it
 * suggests. These are the decisions, without a browser.
 */

const clothing = T.normaliseType({
  id: 1, name: 'Clothing', productCount: 24, specKeys: ['fabric', 'sleeve'],
  blocks: { fit: true, sizeChart: true, composition: true, compliance: true, fitInReviews: true },
  labels: { composition: 'Fabric', care: 'Care', details: 'Details', weightUnit: 'gsm' },
})
const furniture = T.normaliseType({
  id: 7, name: 'Furniture', productCount: 1, specKeys: ['wood', 'length'],
  blocks: { fit: false, sizeChart: false, composition: true, compliance: true, fitInReviews: false },
  labels: { composition: 'Materials', care: 'Care', details: 'Details', weightUnit: 'kg' },
})
const coffee = T.normaliseType({
  id: 9, name: 'Coffee', productCount: 0, specKeys: [],
  blocks: { fit: false, sizeChart: false, composition: true, compliance: true, fitInReviews: false },
  labels: { composition: 'Ingredients', care: 'Storage', details: 'Details', weightUnit: 'g' },
})

/* ── types, tabs and panels ────────────────────────────────────────────── */

test('a type is normalised: string id, every block a boolean, labels filled, an empty unit kept', () => {
  const t = T.normaliseType({ id: 3, name: 'Rugs', blocks: { sizeChart: true }, labels: { composition: 'Contents', weightUnit: '' } })
  assert.equal(t.id, '3')
  assert.deepEqual(t.blocks, { fit: false, sizeChart: true, composition: false, compliance: false, fitInReviews: false })
  assert.deepEqual(t.labels, { composition: 'Contents', care: 'Care', details: 'Details', weightUnit: '' })
  assert.deepEqual(t.specKeys, [])
  assert.equal(T.normaliseType(null), null)
})

test('the fit tab is named from what it holds, and is absent when it holds nothing', () => {
  assert.equal(T.fitTabLabel(clothing.blocks, clothing.labels), 'Fit, size & fabric')
  assert.equal(T.fitTabLabel(furniture.blocks, furniture.labels), 'Materials')
  assert.equal(T.fitTabLabel(coffee.blocks, coffee.labels), 'Ingredients')
  assert.equal(T.fitTabLabel({ fit: true, composition: true }, clothing.labels), 'Fit & fabric')
  assert.equal(T.fitTabLabel({ sizeChart: true, composition: true }, furniture.labels), 'Size & materials')
  assert.equal(T.fitTabLabel({ sizeChart: true }, furniture.labels), 'Size chart')
  assert.equal(T.fitTabLabel({ compliance: true }, furniture.labels), null)
  assert.deepEqual(T.editorTabs({ compliance: true }, {}).map(([k]) => k), ['details', 'media', 'variants', 'enrichment', 'organise'])
  assert.deepEqual(T.editorTabs(coffee.blocks, coffee.labels)[3], ['fit', 'Ingredients'])
})

test('a refused save opens the tab to fix it, or Details when that tab is hidden', () => {
  const all = T.editorTabs(clothing.blocks, clothing.labels).map(([k]) => k)
  const none = T.editorTabs({}, {}).map(([k]) => k)
  assert.equal(T.tabForError('composition_total', all), 'fit')
  assert.equal(T.tabForError('unknown_size_chart', none), 'details')
  assert.equal(T.tabForError('unknown_product_type', all), 'details')
  assert.equal(T.tabForError('invalid_spec_value', none), 'enrichment')
  assert.equal(T.tabForError('something_else', all), null)
})

test('the type is the product’s own, the library’s default for a new product, or none', () => {
  const types = [clothing, furniture]
  assert.equal(T.resolveProductType({ productTypeId: '7', types }).name, 'Furniture')
  assert.equal(T.resolveProductType({ productTypeId: null, types, defaultId: 1, isNew: true }).name, 'Clothing')
  assert.equal(T.resolveProductType({ productTypeId: null, types, defaultId: 1, isNew: false }), null)
  // The library has not loaded, but the product arrived with its type.
  assert.equal(T.resolveProductType({ productTypeId: 9, productType: coffee, types: [] }).labels.composition, 'Ingredients')
  assert.equal(T.resolveProductType({ productTypeId: 42, types }), null)
})

test('with no type the editor keeps its old guess, so nothing editable disappears', () => {
  assert.equal(T.fitTabLabel(T.fallbackType(true).blocks, T.fallbackType(true).labels), 'Fit, size & fabric')
  assert.equal(T.fitTabLabel(T.fallbackType(false).blocks, T.fallbackType(false).labels), null)
  assert.equal(T.fallbackType(false).blocks.compliance, true)
})

test('compliance rows show when the type wants them or the product already has some', () => {
  assert.equal(T.showCompliance({ compliance: false }, {}), false)
  assert.equal(T.showCompliance({ compliance: false }, { maker: { name: '  ' } }), false)
  assert.equal(T.showCompliance({ compliance: false }, { manufacturer: { countryOfOrigin: 'India' } }), true)
  assert.equal(T.showCompliance({ compliance: true }, {}), true)
})

test('the preview renders only the blocks the type has, under the type’s words', () => {
  const draft = {
    title: 'Oak table', fit: { verdict: 'true-to-size' }, fabric: { composition: [['Oak', 100]] }, sizeChartId: 'tops',
    enrichment: { manufacturer: { countryOfOrigin: 'India' } },
  }
  const charts = [{ id: 'tops', columns: ['Size'], rows: [] }]
  const table = T.previewProduct(draft, { type: furniture, charts })
  assert.equal(table.fit, null)
  assert.equal(table.sizeChart, null)
  assert.deepEqual(table.fabric, draft.fabric)
  assert.equal(table.enrichment.labels.fabric, 'Materials & care')
  assert.ok(table.enrichment.manufacturer)
  const noCompliance = T.previewProduct(draft, { type: T.normaliseType({ ...furniture, blocks: { composition: true } }), charts })
  assert.equal(noCompliance.enrichment.manufacturer, undefined)
  assert.equal(T.previewProduct(draft, { type: clothing, charts }).sizeChart.id, 'tops')
  assert.equal(T.previewProduct(draft, { charts }).fit.verdict, 'true-to-size', 'no type: nothing hidden')
})

/* ── options and variants ──────────────────────────────────────────────── */

test('a colour option is one the library shows as swatches, or one called colour', () => {
  const known = [{ name: 'Finish', displayType: 'color' }, { name: 'Grind', displayType: 'select' }]
  assert.equal(T.isColourOption({ name: 'Colour' }), true)
  assert.equal(T.isColourOption({ name: 'color' }), true)
  assert.equal(T.isColourOption({ name: 'Finish' }, known), true)
  assert.equal(T.isColourOption({ name: 'Finish' }), false)
  assert.equal(T.isColourOption({ name: 'Grind' }, known), false)
  assert.equal(T.isColourOption({ name: 'Shade', displayType: 'color' }), true)
  assert.equal(T.colourOptionOf([{ name: 'Weight' }, { name: 'Grind' }], known), null)
})

const coffeeBag = {
  slug: 'house-coffee',
  options: [
    { name: 'Weight', values: ['250 g', '1 kg'] },
    { name: 'Grind', values: ['Whole bean', 'Filter', 'Espresso'] },
  ],
  variants: [
    { id: 'a', options: { Weight: '250 g', Grind: 'Whole bean' } },
    { id: 'b', options: { Grind: 'Filter', Weight: '1 kg' } },
  ],
}

test('missing combinations cover any number of options, and the matrix may stay sparse', () => {
  const missing = T.missingCombinations(coffeeBag.options, coffeeBag.variants)
  assert.equal(missing.length, 4)
  assert.deepEqual(missing[0], { Weight: '250 g', Grind: 'Filter' })
  assert.ok(!missing.some((m) => m.Weight === '1 kg' && m.Grind === 'Filter'), 'key order in a variant does not matter')

  const three = [...coffeeBag.options, { name: 'Roast', values: ['Light', 'Dark'] }]
  assert.equal(T.cartesian(T.optionAxes(three)).length, 12)
  assert.deepEqual(Object.keys(T.cartesian(T.optionAxes(three))[0]), ['Weight', 'Grind', 'Roast'])
})

test('an option with no values is not an axis; a product with no options is missing its one row', () => {
  assert.deepEqual(T.missingCombinations([{ name: 'Weight', values: ['250 g'] }, { name: 'Grind', values: [] }], []), [{ Weight: '250 g' }])
  assert.deepEqual(T.missingCombinations([], []), [{}])
  assert.deepEqual(T.missingCombinations([{ name: 'Size', values: [] }], [{ id: 'x', options: {} }]), [])
})

test('a variant is named in option order, and a new row gets an id that does not repeat', () => {
  assert.equal(T.variantLabel(coffeeBag.variants[1], ['Weight', 'Grind']), '1 kg · Filter')
  assert.equal(T.variantLabel({ options: {} }, []), 'Default')
  const first = T.variantIdentity({ slug: 'house-coffee', combo: { Weight: '250 g', Grind: 'Whole bean' } })
  assert.deepEqual(first, { id: 'var_house-coffee_250-g_whole-bean', sku: 'HOUSE--250G-WHOLEB' })
  assert.equal(T.variantIdentity({ slug: 'house-coffee', combo: { Weight: '250 g', Grind: 'Whole bean' }, taken: [first.id] }).id, `${first.id}-2`)
  assert.equal(T.variantIdentity({ slug: 'oxford', combo: { Color: 'Ecru', Size: 'M' }, colourName: 'Color' }).sku, 'OXFORD-ECR-M')
})

test('changing one option’s values leaves the others alone and removes only orphaned rows', () => {
  const next = T.setOptionValues(coffeeBag, 'Grind', ['Whole bean', 'Espresso'])
  assert.deepEqual(next.options[0], coffeeBag.options[0])
  assert.deepEqual(next.options[1].values, ['Whole bean', 'Espresso'])
  assert.deepEqual(next.removed.map((v) => v.id), ['b'])
  assert.deepEqual(next.variants.map((v) => v.id), ['a'])
  assert.deepEqual(T.setOptionValues(coffeeBag, 'Roast', ['Dark']).options.at(-1), { name: 'Roast', values: ['Dark'] })
})

test('an option written with choices keeps them in step with its values', () => {
  const phone = {
    options: [{ id: 'color', name: 'Color', values: ['Graphite'], choices: [{ id: 'c-g', name: 'Graphite', color: '#333' }] }],
    variants: [],
  }
  const next = T.setOptionValues(phone, 'Color', ['Graphite', 'Sand'], { Sand: '#d8c8a8' })
  assert.deepEqual(next.options[0].choices.map((c) => [c.id, c.name, c.color]), [['c-g', 'Graphite', '#333'], ['color:Sand', 'Sand', '#d8c8a8']])
})

test('options can be renamed, reordered and removed, and variants follow', () => {
  const renamed = T.renameOption(coffeeBag, 'Grind', 'Grind size')
  assert.deepEqual(renamed.options.map((o) => o.name), ['Weight', 'Grind size'])
  assert.deepEqual(renamed.variants[0].options, { Weight: '250 g', 'Grind size': 'Whole bean' })
  assert.deepEqual(T.moveOption(coffeeBag.options, 1, 0).map((o) => o.name), ['Grind', 'Weight'])
  assert.equal(T.moveOption(coffeeBag.options, 0, -1), coffeeBag.options)
  const removed = T.removeOption(coffeeBag, 'Grind')
  assert.deepEqual(removed.options.map((o) => o.name), ['Weight'])
  assert.equal(removed.removed.length, 2)
  assert.match(T.optionNameProblem('grind', coffeeBag.options), /already has an option called “Grind”/)
  assert.equal(T.optionNameProblem('Grind', coffeeBag.options, 'Grind'), null)
  assert.equal(T.optionNameProblem('  ', coffeeBag.options), 'Name the option first.')
})

test('a new product starts with Colour and Size only when it is worn and sized', () => {
  assert.deepEqual(T.starterOptions(clothing).map((o) => o.name), ['Color', 'Size'])
  assert.deepEqual(T.starterOptions(furniture), [])
  assert.equal(T.optionsUntouched({ options: [{ name: 'Color', values: [] }], variants: [] }), true)
  assert.equal(T.optionsUntouched({ options: [{ name: 'Finish', values: ['Oak'] }], variants: [] }), false)
})

test('option suggestions put the type’s own names first, and values come from the store', () => {
  const known = [
    { name: 'Color', displayType: 'color', values: ['Ecru', 'Black'], swatches: { Ecru: '#ede6d8' }, productTypeIds: ['1'] },
    { name: 'Finish', displayType: 'radio', values: ['Natural oak', 'Smoked oak'], productTypeIds: ['7'] },
    { name: 'Size', values: ['S', 'M'], productTypeIds: ['1'] },
  ]
  assert.deepEqual(T.optionNameSuggestions(known, '7', []), ['Finish', 'Color', 'Size'])
  assert.deepEqual(T.optionNameSuggestions(known, 1, ['size'], ['Color', 'Length']), ['Color', 'Finish', 'Length'])
  assert.deepEqual(T.valueSuggestions(known, 'finish', ['Smoked oak']), ['Natural oak'])
  assert.deepEqual(T.valueSuggestions(known, 'Length', [], ['S']), ['S'])
  assert.deepEqual(T.knownSwatches(known, 'color'), { Ecru: '#ede6d8' })
})

/* ── specifications and tags ───────────────────────────────────────────── */

test('specification suggestions put the type’s keys first, including ones the vocabulary lacks', () => {
  const vocab = [{ key: 'fabric', label: 'Fabric' }, { key: 'length', label: 'Length' }, { key: 'sleeve', label: 'Sleeve' }]
  const ordered = T.preferSpecKeys(vocab, furniture.specKeys)
  assert.deepEqual(ordered.map((a) => a.key), ['wood', 'length', 'fabric', 'sleeve'])
  assert.equal(ordered[0].label, 'Wood')
  assert.equal(T.preferSpecKeys(vocab, []), vocab)
})

test('changing type warns about the specifications it would drop', () => {
  const specs = { fabric: 'Linen', length: '120 cm' }
  assert.deepEqual(T.droppedSpecs(specs, furniture), ['fabric'])
  assert.deepEqual(T.droppedSpecs(specs, null), [])
  const warning = T.typeChangeWarning({ from: clothing, to: furniture, specs })
  assert.match(warning, /from Clothing to Furniture/)
  assert.match(warning, /removed because Furniture does not define them: Fabric\./)
  assert.match(T.typeChangeWarning({ from: clothing, to: furniture, specs: { length: '1' } }), /none are removed/)
})

test('tag suggestions are the store’s most used, from products of the same type when it can tell', () => {
  const products = [
    { productTypeId: '7', tags: ['oak', 'living'] },
    { productTypeId: '7', tags: ['oak'] },
    { productTypeId: '1', tags: ['linen', 'linen2'] },
  ]
  assert.deepEqual(T.frequentTags(products, { typeId: 7 }), ['oak', 'living'])
  assert.deepEqual(T.frequentTags(products, { typeId: 99, limit: 2 }), ['oak', 'linen'])
})

test('the size charts screen is offered only where a type uses size charts', () => {
  assert.equal(T.usesSizeCharts(null), null)
  assert.equal(T.usesSizeCharts({ attributes: [] }), null, 'a backend without product types keeps the old menu')
  assert.equal(T.usesSizeCharts({ productTypes: [furniture, coffee] }), false)
  assert.equal(T.usesSizeCharts({ productTypes: [furniture, clothing] }), true)
})

/* ── the demo backend ──────────────────────────────────────────────────── */

test('the demo library lists product types, a default and the options in use', async () => {
  const library = await api.listLibrary()
  assert.equal(library.defaultProductTypeId, 'clothing')
  const byId = Object.fromEntries(library.productTypes.map((t) => [t.id, t]))
  assert.equal(byId.clothing.blocks.sizeChart, true)
  assert.equal(byId.clothing.labels.weightUnit, 'gsm')
  assert.equal(byId.goods.blocks.fit, false)
  assert.equal(byId.food.labels.composition, 'Ingredients')
  assert.ok(byId.clothing.productCount > 0)
  const color = library.options.find((o) => o.name === 'Color')
  assert.equal(color.displayType, 'color')
  assert.ok(Object.keys(color.swatches).length > 0)
  assert.ok(library.options.find((o) => o.name === 'Size').productTypeIds.includes('clothing'))
  assert.ok(library.options.find((o) => o.name === 'Grind').productTypeIds.includes('food'))
})

test('a demo product carries its type, refuses an unknown one, and saves back unchanged', async () => {
  const shirt = await api.adminGetProduct('oxford-shirt-ecru')
  assert.equal(shirt.productTypeId, 'clothing')
  assert.equal(shirt.productType.blocks.fit, true)

  const coffeeProduct = await api.adminGetProduct('house-coffee')
  assert.equal(coffeeProduct.productType.name, 'Food & drink')

  await assert.rejects(api.adminSaveProduct({ ...shirt, productTypeId: 'nope' }), (err) => err.code === 'unknown_product_type')

  const saved = await api.adminSaveProduct(structuredClone(coffeeProduct))
  assert.deepEqual(saved.options, coffeeProduct.options)
  assert.deepEqual(saved.variants.map((v) => [v.id, v.options]), coffeeProduct.variants.map((v) => [v.id, v.options]))
  assert.equal(saved.productTypeId, 'food')
})
