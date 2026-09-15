/**
 * Product types, for the admin product editor.
 *
 * A product's type is its backend category (in Odoo, the internal product
 * category), and it decides what the product page is made of: whether there is
 * a fit block, a size chart, a composition list and what that list is called
 * ("Fabric", "Materials", "Ingredients"), whether compliance rows are asked for,
 * and which specifications exist. The storefront already follows it on the
 * product page; this file is the editor following it too, so a furniture store
 * is not asked for a size chart and a coffee roaster is not asked for gsm.
 *
 * Pure and free of React, so the decisions the editor makes (which tabs, which
 * panels, what a tab is called, which combinations are missing) have unit tests.
 */
import { readableKey } from '../data/attributes.js'

export const BLOCKS = ['fit', 'sizeChart', 'composition', 'compliance', 'fitInReviews']

/** The words for clothing: what the editor said before types existed. */
export const CLOTHING_LABELS = { composition: 'Fabric', care: 'Care', details: 'Details', weightUnit: 'gsm' }

/** The words for anything else, when a backend sends none. */
export const NEUTRAL_LABELS = { composition: 'Materials', care: 'Care', details: 'Details', weightUnit: '' }

const lower = (s) => String(s ?? '').trim().toLowerCase()

/** A type as the editor uses it: string id, every block a boolean, every label present. */
export function normaliseType(type) {
  if (!type || type.id == null) return null
  const blocks = Object.fromEntries(BLOCKS.map((k) => [k, Boolean(type.blocks?.[k])]))
  const given = type.labels || {}
  const labels = {
    composition: given.composition || NEUTRAL_LABELS.composition,
    care: given.care || NEUTRAL_LABELS.care,
    details: given.details || NEUTRAL_LABELS.details,
    // An empty unit is a real answer ("no unit"), so only a missing one falls back.
    weightUnit: typeof given.weightUnit === 'string' ? given.weightUnit : NEUTRAL_LABELS.weightUnit,
  }
  return {
    ...type,
    id: String(type.id),
    name: type.name || String(type.id),
    blocks,
    labels,
    specKeys: Array.isArray(type.specKeys) ? type.specKeys.map(String) : [],
    productCount: Number(type.productCount) || 0,
  }
}

/**
 * What to show when no type can be resolved: a backend that predates types, or
 * a library that failed to load. `apparel` is the editor's old guess (the demo,
 * a store with size charts, or a product that already has fit or fabric), so
 * nothing that used to be editable disappears.
 */
export function fallbackType(apparel) {
  return {
    id: null,
    name: null,
    blocks: {
      fit: Boolean(apparel),
      sizeChart: Boolean(apparel),
      composition: Boolean(apparel),
      compliance: true,
      fitInReviews: Boolean(apparel),
    },
    labels: apparel ? { ...CLOTHING_LABELS } : { ...NEUTRAL_LABELS },
    specKeys: [],
    productCount: 0,
  }
}

/**
 * The product's type: its own id looked up in the library, else the type that
 * came with the product, else (a new product) the library's default.
 */
export function resolveProductType({ productTypeId, productType, types = [], defaultId = null, isNew = false } = {}) {
  const id = productTypeId ?? (isNew ? defaultId : null) ?? productType?.id ?? null
  if (id == null) return null
  const found = types.find((t) => t && String(t.id) === String(id))
  if (found) return normaliseType(found)
  if (productType && String(productType.id) === String(id)) return normaliseType(productType)
  return null
}

/** Clothing-like: something is worn and sized. */
export const isApparelType = (type) => Boolean(type?.blocks?.fit || type?.blocks?.sizeChart)

/** "Clothing · 24 products" */
export function typeOptionLabel(type) {
  const n = Number(type?.productCount) || 0
  return `${type?.name ?? ''} · ${n} product${n === 1 ? '' : 's'}`
}

/* ── tabs and panels ───────────────────────────────────────────────────── */

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/**
 * The name of the tab holding fit, size chart and composition, from what it
 * holds: "Fit, size & fabric" for a shirt, "Materials" for a table,
 * "Ingredients" for coffee, and null when it holds nothing.
 */
export function fitTabLabel(blocks = {}, labels = {}) {
  const composition = blocks.composition ? labels.composition || NEUTRAL_LABELS.composition : null
  const measure = blocks.fit && blocks.sizeChart ? 'Fit & size' : blocks.fit ? 'Fit' : blocks.sizeChart ? 'Size chart' : null
  if (!measure && !composition) return null
  if (!composition) return measure
  if (!measure) return composition
  if (blocks.fit && blocks.sizeChart) return `Fit, size & ${lowerFirst(composition)}`
  if (blocks.fit) return `Fit & ${lowerFirst(composition)}`
  return `Size & ${lowerFirst(composition)}`
}

/** The editor's tabs, in order, as `[key, label]`. */
export function editorTabs(blocks = {}, labels = {}) {
  const fit = fitTabLabel(blocks, labels)
  return [
    ['details', 'Details'],
    ['media', 'Media'],
    ['variants', 'Variants'],
    ...(fit ? [['fit', fit]] : []),
    ['enrichment', 'Highlights & specs'],
    ['organise', 'Organise'],
  ]
}

/** Where a refused save is fixed, so the toast is not the only clue. */
const ERROR_TABS = {
  missing_title: 'details',
  invalid_slug: 'details',
  slug_taken: 'details',
  unknown_product_type: 'details',
  invalid_assurance: 'enrichment',
  invalid_feature: 'enrichment',
  composition_total: 'fit',
  unknown_country: 'fit',
  unknown_size_chart: 'fit',
  unknown_variant: 'variants',
  variant_prices: 'variants',
  invalid_inventory: 'variants',
  unknown_image: 'media',
}

/** The tab to open for an error code; a hidden tab's errors open Details instead. */
export function tabForError(code = '', visible = null) {
  const tab = ERROR_TABS[code] || (String(code).startsWith('invalid_spec') ? 'enrichment' : null)
  if (!tab || !visible) return tab
  return visible.includes(tab) ? tab : 'details'
}

/** Anything typed into the maker or manufacturer rows. */
export function hasComplianceData(enrichment) {
  const filled = (v) => v != null && String(v).trim() !== ''
  return Boolean(
    Object.values(enrichment?.maker || {}).some(filled) ||
      Object.values(enrichment?.manufacturer || {}).some(filled),
  )
}

/** Compliance rows are asked for when the type wants them, and kept editable wherever they already exist. */
export const showCompliance = (blocks, enrichment) => Boolean(blocks?.compliance) || hasComplianceData(enrichment)

/**
 * The draft as the product page would receive it: a block the type switches off
 * is not rendered, whatever is stored under it.
 */
export function previewProduct(draft, { type, charts = [] } = {}) {
  if (!draft) return null
  const blocks = type?.blocks
  const chart = draft.sizeChartId ? charts.find((c) => c.id === draft.sizeChartId) || null : null
  const product = {
    ...draft,
    slug: draft.slug || 'preview',
    images: draft.images?.length ? draft.images : [{ id: 'none', url: '', alt: '' }],
    options: draft.options || [],
    variants: draft.variants || [],
    rating: draft.rating || { average: 0, count: 0 },
    sizeChart: !blocks || blocks.sizeChart ? chart : null,
  }
  if (!blocks) return product
  if (!blocks.fit) product.fit = null
  if (!blocks.composition) product.fabric = null
  if (type?.name) {
    const { labels } = type
    const e = { ...(draft.enrichment || {}) }
    // The product page names its tabs from the store's words; the type's are those words.
    e.labels = {
      ...(blocks.composition ? { fabric: `${labels.composition} & ${lowerFirst(labels.care)}` } : { fabric: labels.care }),
      details: labels.details,
      ...(draft.enrichment?.labels || {}),
    }
    if (!blocks.compliance) {
      delete e.manufacturer
      delete e.maker
    }
    product.enrichment = e
  }
  return product
}

/* ── options and variants ──────────────────────────────────────────────── */

const COLOUR_NAME = /^colou?rs?$/i

/** A colour option is picked from swatches: the library says so, the option says so, or it is called Colour. */
export function isColourOption(option, known = []) {
  if (!option?.name) return false
  if (option.displayType === 'color' || option.role === 'color') return true
  const listed = known.find((o) => lower(o?.name) === lower(option.name))
  return listed?.displayType === 'color' || COLOUR_NAME.test(String(option.name).trim())
}

/** The product's first colour option, if it has one. */
export const colourOptionOf = (options = [], known = []) => options.find((o) => isColourOption(o, known)) || null

/** Options that are axes of the matrix: an option with no values yet is not one. */
export const optionAxes = (options = []) => options.filter((o) => o?.name && o.values?.length)

const comboKey = (combo, names) => JSON.stringify(names.map((n) => combo?.[n] ?? null))

/** Every combination of the axes' values, in option order: `[{Weight: '250 g', Grind: 'Filter'}, …]`. */
export function cartesian(axes = []) {
  return axes.reduce((acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))), [{}])
}

/**
 * Combinations that exist as options but have no variant row.
 *
 * Deliberately a list of what is missing, not a warning: not every colour comes
 * in every size, so a sparse matrix is ordinary and nothing is added until the
 * merchant asks. A product with no options at all is missing its one row until
 * it has it.
 */
export function missingCombinations(options = [], variants = []) {
  const axes = optionAxes(options)
  if (!axes.length) return variants.length ? [] : [{}]
  const names = axes.map((a) => a.name)
  const present = new Set(variants.map((v) => comboKey(v.options, names)))
  return cartesian(axes).filter((combo) => !present.has(comboKey(combo, names)))
}

/** "Oat · M", in the product's option order, whatever the variant's keys are ordered as. */
export function variantLabel(variant, names = [], fallback = 'Default') {
  const opts = variant?.options || {}
  const ordered = [...names.filter((n) => n in opts), ...Object.keys(opts).filter((k) => !names.includes(k))]
  const text = ordered.map((k) => opts[k]).filter((v) => v != null && v !== '').join(' · ')
  return text || fallback
}

const skuPart = (value, colour) =>
  colour ? String(value).slice(0, 3).toUpperCase() : String(value).replace(/[^a-z0-9.]+/gi, '').toUpperCase().slice(0, 6)

/** A new row's id and SKU, from the product slug and the combination; the id never repeats one in `taken`. */
export function variantIdentity({ slug = '', combo = {}, colourName = null, taken = [] } = {}) {
  const values = Object.values(combo)
  const base = `var_${slug || 'new'}_${values.length ? values.join('_') : 'default'}`.toLowerCase().replace(/[^a-z0-9_]+/g, '-')
  const used = new Set(taken)
  let id = base
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
  const sku = [
    (slug || 'SKU').slice(0, 6).toUpperCase(),
    ...Object.entries(combo).map(([name, v]) => skuPart(v, name === colourName)),
  ]
    .filter(Boolean)
    .join('-')
  return { id, sku }
}

/**
 * A demo product written with `choices` keeps them in step with its values, or
 * the shop goes on offering the old list. A plain `{name, values}` option is
 * returned with the new values and nothing else changed.
 */
function withValues(option, values, swatches) {
  if (!Array.isArray(option.choices)) return { ...option, values }
  const choices = values.map((name) => {
    const existing = option.choices.find((c) => c.name === name)
    const color = swatches?.[name]
    if (existing) return color && existing.color !== undefined ? { ...existing, color } : existing
    return { id: `${option.id ?? option.name}:${name}`, name, color: color || null, image: null, priceExtra: null, custom: false }
  })
  return { ...option, values, choices }
}

/**
 * Set one option's values. Only that option changes; rows for a value that is
 * gone go with it, because a row pointing at a value the product no longer has
 * cannot be saved.
 */
export function setOptionValues(product, name, values, swatches = product?.swatches) {
  const current = product?.options || []
  const options = current.some((o) => o.name === name)
    ? current.map((o) => (o.name === name ? withValues(o, values, swatches) : o))
    : [...current, { name, values }]
  const variants = product?.variants || []
  const removed = variants.filter((v) => v.options?.[name] != null && !values.includes(v.options[name]))
  const drop = new Set(removed.map((v) => v.id))
  return { options, variants: variants.filter((v) => !drop.has(v.id)), removed }
}

/** Why a name cannot be used for an option, or null. */
export function optionNameProblem(name, options = [], current = null) {
  const t = String(name ?? '').trim()
  if (!t) return 'Name the option first.'
  const clash = options.find((o) => lower(o.name) === lower(t) && o.name !== current)
  return clash ? `This product already has an option called “${clash.name}”.` : null
}

/** Rename an option, and the key every variant stores its value under. */
export function renameOption(product, from, to) {
  const name = String(to).trim()
  return {
    options: (product?.options || []).map((o) => (o.name === from ? { ...o, name } : o)),
    variants: (product?.variants || []).map((v) => {
      if (!v.options || !(from in v.options)) return v
      const options = {}
      for (const [k, val] of Object.entries(v.options)) options[k === from ? name : k] = val
      return { ...v, options }
    }),
  }
}

/** Remove an option. The rows that carry a value for it go too: they describe combinations that no longer exist. */
export function removeOption(product, name) {
  const variants = product?.variants || []
  const removed = variants.filter((v) => v.options?.[name] != null)
  const drop = new Set(removed.map((v) => v.id))
  return {
    options: (product?.options || []).filter((o) => o.name !== name),
    variants: variants.filter((v) => !drop.has(v.id)),
    removed,
  }
}

/** Move the option at `from` to `to`; out of range leaves the list alone. */
export function moveOption(options = [], from, to) {
  if (to < 0 || to >= options.length || from === to) return options
  const next = options.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** The options a new product starts with: empty Colour and Size for something worn and sized, nothing otherwise. */
export const starterOptions = (type) =>
  isApparelType(type) ? [{ name: 'Color', values: [] }, { name: 'Size', values: [] }] : []

/** True when the options are only an untouched starting point, so a type change may replace them. */
export const optionsUntouched = (product) =>
  !(product?.variants || []).length && (product?.options || []).every((o) => !o.values?.length)

const uniqueByName = (names) => {
  const seen = new Set()
  return names.filter((n) => {
    const k = lower(n)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Option names to suggest: the ones products of this type already use, then
 * the rest of the store's, then `extra`; never one the product already has.
 */
export function optionNameSuggestions(known = [], typeId = null, used = [], extra = []) {
  const taken = new Set(used.map(lower))
  const fresh = known.filter((o) => o?.name && !taken.has(lower(o.name)))
  const mine = typeId == null ? [] : fresh.filter((o) => (o.productTypeIds || []).map(String).includes(String(typeId)))
  return uniqueByName([
    ...mine.map((o) => o.name),
    ...fresh.filter((o) => !mine.includes(o)).map((o) => o.name),
    ...extra.filter((n) => !taken.has(lower(n))),
  ])
}

/** Values the store already uses for an option of this name, minus the ones chosen; `fallback` when it knows none. */
export function valueSuggestions(known = [], name, used = [], fallback = []) {
  const listed = known.filter((o) => lower(o?.name) === lower(name)).flatMap((o) => o.values || [])
  const pool = listed.length ? listed : fallback
  return [...new Set(pool.map(String))].filter((v) => !used.includes(v))
}

/** Swatch colours the store has used for an option of this name. */
export const knownSwatches = (known = [], name) =>
  Object.assign({}, ...known.filter((o) => lower(o?.name) === lower(name)).map((o) => o.swatches || {}))

/* ── specifications and tags ───────────────────────────────────────────── */

/** The vocabulary with the type's own keys first, stubs added for keys it defines but the vocabulary lacks. */
export function preferSpecKeys(attributes = [], specKeys = []) {
  if (!specKeys?.length) return attributes
  const want = new Set(specKeys)
  const have = new Set(attributes.map((a) => a.key))
  const stubs = specKeys.filter((k) => !have.has(k)).map((key) => ({ key, label: readableKey(key), group: 'general' }))
  const inType = [...attributes.filter((a) => want.has(a.key)), ...stubs]
  return [...inType.sort((a, b) => specKeys.indexOf(a.key) - specKeys.indexOf(b.key)), ...attributes.filter((a) => !want.has(a.key))]
}

/** Specification keys a product would lose by becoming `type`. */
export function droppedSpecs(specs = {}, type = null) {
  if (!type || !Array.isArray(type.specKeys)) return []
  const keep = new Set(type.specKeys)
  return Object.keys(specs || {}).filter((k) => !keep.has(k))
}

/** The confirmation shown before an existing product changes type. */
export function typeChangeWarning({ from, to, specs = {}, label = readableKey } = {}) {
  const lost = droppedSpecs(specs, to)
  const head = `Change this product's type${from?.name ? ` from ${from.name}` : ''} to ${to?.name}?`
  const what = `The type decides what the product page shows: fit, size chart, ${lowerFirst(to?.labels?.composition || 'materials')}, compliance rows and which specifications exist.`
  const specLine = lost.length
    ? `When you save, these specifications are removed because ${to?.name} does not define them: ${lost.map(label).join(', ')}.`
    : `Every specification this product has is defined on ${to?.name}, so none are removed.`
  return `${head}\n\n${what}\n\n${specLine}`
}

/** The tags the store uses most, preferring products of the same type when the list says which type each is. */
export function frequentTags(products = [], { typeId = null, limit = 12 } = {}) {
  const same = typeId == null ? [] : products.filter((p) => p.productTypeId != null && String(p.productTypeId) === String(typeId))
  const pool = same.length ? same : products
  const counts = new Map()
  for (const p of pool) for (const t of p.tags || []) if (t) counts.set(t, (counts.get(t) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t)
}

/**
 * Whether the store sells anything that uses size charts: true or false once
 * the library says, null when it cannot (still loading, or a backend without
 * product types — the caller keeps its old behaviour).
 */
export function usesSizeCharts(library) {
  if (!library || !Array.isArray(library.productTypes)) return null
  return library.productTypes.some((t) => Boolean(t?.blocks?.sizeChart))
}
