/**
 * The demo database.
 *
 * Mock mode used to read the catalogue straight out of `src/data/catalog.js`,
 * which meant the storefront was read-only — there was nothing for an admin
 * panel to write to. This is the seam that fixes that: one localStorage-backed
 * store that both the storefront and the admin panel read and write, so an edit
 * in admin is visible on the shop immediately, in the same tab and in every
 * other tab.
 *
 * It is deliberately a *database*, not a React store. The mock API adapter
 * queries it exactly the way the HTTP adapter queries a server, so nothing
 * above `src/lib/api/` can tell which is running — including the admin panel,
 * which talks to the same write endpoints a real backend would expose.
 *
 * In api mode this file is never touched.
 */

import { isRealDiscount } from './money.js'

const KEY = 'loom.db'
const VERSION = 10

const listeners = new Set()
let cache = null

function nowIso() {
  return new Date().toISOString()
}

/** Seeded once, then owned by the user. Bumping VERSION reseeds. */
async function seed() {
  const [{ products, categories, collections }, { storefront }, { sizeCharts }] = await Promise.all([
    import('../data/catalog.js'),
    import('../data/storefront.js'),
    import('../data/fit.js'),
  ])
  return {
    version: VERSION,
    seededAt: nowIso(),
    products: products.map((p) => ({ ...p, updatedAt: nowIso() })),
    categories: categories.map((c) => ({ ...c })),
    collections: collections.map((c) => ({ ...c })),
    // Shared and referenced by id, so editing "tops" fixes it on all nine
    // products that use it instead of nine separate tables drifting apart.
    sizeCharts: Object.entries(sizeCharts).map(([id, chart]) => ({ id, ...chart })),
    settings: storefront,
    // Starts empty: it is the merchant's own vocabulary, not ours.
    library: { attributes: [], features: [], assurances: [] },
  }
}

/**
 * `origin` tells a subscriber whether this tab caused the change.
 *
 * It matters because the two need different handling. A local write already
 * knows precisely what it invalidated — `PURGES` in the API layer lists it. A
 * write that arrived from another tab knows nothing, so the only safe response
 * is to drop the cached reads and re-read.
 */
function persist(next, origin = 'local') {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota, private mode, or a catalogue larger than 5MB. The session still
    // works from memory; it just will not survive a reload.
  }
  listeners.forEach((fn) => {
    try {
      fn(next, origin)
    } catch {
      /* a bad subscriber must not break a write */
    }
  })
  return next
}

/** Resolves once, then synchronous. Every caller awaits `ready()` first. */
let readyPromise = null
export function ready() {
  if (cache) return Promise.resolve(cache)
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    let stored = null
    try {
      stored = JSON.parse(localStorage.getItem(KEY) || 'null')
    } catch {
      stored = null
    }
    if (!stored) return persist(await seed())

    if (stored.version !== VERSION) {
      // Reseeding outright would throw away everything the user has edited, and
      // silently: the catalogue would look fine and their work would be gone.
      // Backfilling instead means a field added to the seed after they started
      // — enrichment, size charts — appears on their products without touching
      // what they changed.
      return persist(await backfill(stored))
    }
    cache = stored
    return cache
  })()
  return readyPromise
}

/**
 * Fill gaps from `seeded` into `existing`, at every depth.
 *
 * A top-level-only merge was enough while the seed only ever gained whole
 * fields. It stops being enough the moment it gains a field *inside* one that
 * already exists — a store holding `enrichment` from an earlier version has the
 * key, so a shallow merge skips it, and the new sub-blocks never arrive. That
 * failure is silent and looks exactly like the feature not working.
 *
 * Arrays are left alone rather than merged: a shopper-facing list the user has
 * emptied on purpose must stay empty, and there is no sane way to reconcile two
 * orderings of rows nobody asked us to reconcile.
 */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function fillMissing(existing, seeded) {
  if (!isPlainObject(existing) || !isPlainObject(seeded)) return existing
  const out = { ...existing }
  for (const [key, value] of Object.entries(seeded)) {
    if (out[key] === undefined || out[key] === null) out[key] = value
    else if (isPlainObject(out[key]) && isPlainObject(value)) out[key] = fillMissing(out[key], value)
  }
  return out
}

/**
 * Take the seed's gallery when the stored one has clearly never been touched.
 *
 * `fillMissing` leaves arrays alone, which is right almost everywhere — a list
 * the user has emptied on purpose must stay empty. It is wrong for exactly one
 * case: the seed gained a photograph per colourway, and a store still holding
 * the original two untagged images would keep them forever, so picking a colour
 * would go on changing nothing.
 *
 * The test for "never touched" is narrow on purpose — the same two ids the old
 * seed wrote, in that order, none of them tagged with a colour. Anything else,
 * including one renamed alt text, is treated as the merchant's and left alone.
 * Guessing wrong here silently destroys someone's photography, which is a much
 * worse outcome than a demo that keeps showing one shot.
 */
function adoptSeededPhotography(product, seeded) {
  const stored = product.images || []
  const pristine =
    stored.length === 2 &&
    stored.every((img) => !img.color) &&
    stored[0]?.id === `${product.slug}-1` &&
    stored[1]?.id === `${product.slug}-2`

  if (!pristine || !seeded.images?.length) return product

  // Variants follow, but only the ones still pointing at the old single shot.
  const byColor = new Map(seeded.images.filter((i) => i.color).map((i) => [i.color, i.id]))
  const variants = (product.variants || []).map((v) =>
    v.imageId && v.imageId !== `${product.slug}-1`
      ? v
      : { ...v, imageId: byColor.get(v.options?.Color) || v.imageId },
  )

  return { ...product, images: seeded.images, variants }
}

/**
 * Bring an older store up to the current shape.
 *
 * Seed values fill gaps; anything already present wins, because it is either
 * the original seed or something the user typed. Products the seed has gained
 * since are added; products the user created are left alone.
 *
 * A real backend runs ordered migrations against a schema. This is demo data in
 * a browser, and a field-level merge is the honest equivalent — it is why this
 * file is demo-only and `api` mode never touches it.
 */
async function backfill(stored) {
  const fresh = await seed()
  const bySlug = new Map((stored.products || []).map((p) => [p.slug, p]))

  const products = fresh.products.map((seeded) => {
    const existing = bySlug.get(seeded.slug)
    if (!existing) return seeded
    bySlug.delete(seeded.slug)
    // Only fill what is missing, at every depth. A key the user has edited
    // keeps its value even when the seed has since changed it.
    return adoptSeededPhotography(fillMissing(existing, seeded), seeded)
  })

  // Anything the user added that the seed does not know about.
  products.push(...bySlug.values())

  const mergeById = (seedList, storedList, key) => {
    const map = new Map((seedList || []).map((x) => [x[key], x]))
    ;(storedList || []).forEach((x) => map.set(x[key], { ...map.get(x[key]), ...x }))
    return [...map.values()]
  }

  return {
    ...fresh,
    version: VERSION,
    products,
    categories: mergeById(fresh.categories, stored.categories, 'slug'),
    collections: mergeById(fresh.collections, stored.collections, 'slug'),
    sizeCharts: mergeById(fresh.sizeCharts, stored.sizeCharts, 'id'),
    settings: deepMerge(fresh.settings, stored.settings || {}),
    library: { ...fresh.library, ...(stored.library || {}) },
  }
}

export function snapshot() {
  return cache
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Another tab wrote. Adopt it, and say that it came from outside.
 *
 * Adopting was never the missing half — this listener already existed and the
 * data did arrive. What did not arrive was any signal that the layers above
 * were now stale: the API cache went on serving the copy it had, and nothing
 * told a mounted page to re-read. So an admin tab could save a price and the
 * shop tab beside it would show the old one until its five-minute TTL lapsed.
 *
 * The `'remote'` origin is what lets the adapter respond differently to a
 * change it did not make.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      const next = JSON.parse(e.newValue)
      cache = next
      listeners.forEach((fn) => {
        try {
          fn(next, 'remote')
        } catch {
          /* one bad subscriber must not stop the others */
        }
      })
    } catch {
      /* ignore a partial write from another tab */
    }
  })
}

/* ── reads ─────────────────────────────────────────────────────────────── */

export const getProducts = () => cache?.products || []
export const getCategories = () => cache?.categories || []
export const getCollections = () => cache?.collections || []
export const getSettings = () => cache?.settings || {}
export const getSizeCharts = () => cache?.sizeCharts || []

export function upsertSizeChart(chart) {
  const charts = getSizeCharts().slice()
  const i = charts.findIndex((c) => c.id === chart.id)
  if (i >= 0) charts[i] = { ...charts[i], ...chart }
  else charts.push(chart)
  persist({ ...cache, sizeCharts: charts })
  return chart
}

/* ── writes ────────────────────────────────────────────────────────────── */

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`

/**
 * Badges are derived, never stored by hand.
 *
 * `sale` follows compare-at, `sold-out` and `low-stock` follow the variants.
 * Computing them once at seed time and then never again is how a product sells
 * out in admin and keeps advertising itself as in stock on the grid.
 */
function deriveBadges(product) {
  const manual = (product.badges || []).filter((b) => ['new', 'bestseller'].includes(b))
  const variants = product.variants || []
  const live = variants.filter((v) => v.available)
  const out = [...manual]
  // A sale badge on a 2% reduction is the same claim the price chip declines to
  // make, so it uses the same threshold — one of them shouting while the other
  // stays quiet is worse than either alone.
  if (isRealDiscount(product.price, product.compareAtPrice)) out.push('sale')
  if (variants.length && live.length === 0) out.push('sold-out')
  else if (live.length && live.length <= 2) out.push('low-stock')
  return [...new Set(out)]
}

/**
 * Product price cascades to variants that were not individually overridden.
 *
 * Without this the grid shows the new price and the cart charges the old one —
 * a live mispricing with nothing on screen to warn anyone.
 */
function cascadePrice(next, previous) {
  if (!next.variants?.length || !next.price) return next
  const oldAmount = previous?.price?.amount
  return {
    ...next,
    variants: next.variants.map((v) => {
      const overridden = oldAmount !== undefined && v.price?.amount !== oldAmount
      return overridden ? v : { ...v, price: next.price, compareAtPrice: next.compareAtPrice ?? null }
    }),
  }
}

/**
 * Fill in what a caller left out.
 *
 * A write from an integrator will omit half of these — nobody posting their
 * first product sends `rating`, `tags` and `social`. Defaulting here, once, is
 * what stops a missing field surfacing as a crash inside a sort comparator on
 * a page nobody connected to the write.
 */
function normalise(product) {
  return {
    tags: [],
    badges: [],
    details: [],
    care: [],
    categories: [],
    relatedSlugs: [],
    images: [],
    variants: [],
    options: [],
    swatches: {},
    social: null,
    fit: null,
    fabric: null,
    sizeChartId: null,
    compareAtPrice: null,
    published: true,
    createdAt: nowIso(),
    ...product,
    // Nested shapes need their own defaults; a spread would accept a partial.
    rating: { average: 0, count: 0, ...(product.rating || {}) },
    price: product.price || { amount: 0, currency: 'USD' },
  }
}

export function upsertProduct(patch) {
  const products = getProducts().slice()
  const byId = patch.id ? products.findIndex((p) => p.id === patch.id) : -1
  const bySlug = products.findIndex((p) => p.slug === patch.slug)

  // Creating a product whose slug is already taken must fail loudly. Merging
  // silently is how one product quietly overwrites another.
  if (byId === -1 && bySlug !== -1 && patch.id && products[bySlug].id !== patch.id) {
    const err = new Error(`The slug "${patch.slug}" is already used by another product.`)
    err.code = 'slug_taken'
    throw err
  }
  if (byId === -1 && !patch.id && bySlug !== -1) {
    const err = new Error(`The slug "${patch.slug}" is already in use.`)
    err.code = 'slug_taken'
    throw err
  }

  const i = byId !== -1 ? byId : bySlug
  const previous = i >= 0 ? products[i] : null
  let next = normalise({ ...(previous || {}), ...patch, updatedAt: nowIso() })
  if (!next.id) next.id = uid('prod')
  next = cascadePrice(next, previous)
  next.badges = deriveBadges(next)

  if (i >= 0) products[i] = next
  else products.unshift(next)
  persist({ ...cache, products })
  return next
}

export function deleteProduct(idOrSlug) {
  const products = getProducts().filter((p) => p.id !== idOrSlug && p.slug !== idOrSlug)
  persist({ ...cache, products })
  return { ok: true }
}

/**
 * Stock moves by delta, not by assignment.
 *
 * Two people adjusting the same SKU with `set` silently overwrite each other;
 * with a delta both adjustments land. It is also the only shape that survives
 * being replayed by a webhook retry without double-counting, because the caller
 * can key on an operation id.
 */
export function adjustInventory(variantId, delta) {
  const products = getProducts().map((p) => {
    if (!p.variants.some((v) => v.id === variantId)) return p
    const updated = {
      ...p,
      updatedAt: nowIso(),
      variants: p.variants.map((v) =>
        v.id === variantId
          ? { ...v, inventory: Math.max(0, v.inventory + delta), available: Math.max(0, v.inventory + delta) > 0 }
          : v,
      ),
    }
    // Selling the last one must turn the card over on the grid.
    return { ...updated, badges: deriveBadges(updated) }
  })
  persist({ ...cache, products })
  return getProducts().flatMap((p) => p.variants).find((v) => v.id === variantId)
}

export function setInventory(variantId, quantity) {
  const current = getProducts().flatMap((p) => p.variants).find((v) => v.id === variantId)
  if (!current) return null
  return adjustInventory(variantId, quantity - current.inventory)
}

export function upsertCategory(patch) {
  const categories = getCategories().slice()
  const i = categories.findIndex((c) => c.slug === patch.slug)
  if (i >= 0) categories[i] = { ...categories[i], ...patch }
  else categories.push(patch)
  persist({ ...cache, categories })
  return patch
}

export function deleteCategory(slug) {
  // Children are promoted to the deleted node's parent rather than orphaned.
  const target = getCategories().find((c) => c.slug === slug)
  const categories = getCategories()
    .filter((c) => c.slug !== slug)
    .map((c) => (c.parent === slug ? { ...c, parent: target?.parent ?? null } : c))
  persist({ ...cache, categories })
  return { ok: true }
}

/**
 * The reuse library: what this store has described before.
 *
 * A merchant photographing a hundred shirts types "Collar type" on the first
 * one and then has to remember, on the sixtieth, whether they wrote "Collar
 * type", "Collar" or "Neck". The built-in vocabulary cannot help — it is a
 * starting point, not their catalogue — so the store keeps its own.
 *
 * Three kinds, because they are reused in different ways: an `attribute` is a
 * key and the values seen against it, a `feature` and an `assurance` are whole
 * blocks worth pasting onto the next product unchanged.
 */
export function getLibrary() {
  const l = cache?.library || {}
  return { attributes: l.attributes || [], features: l.features || [], assurances: l.assurances || [] }
}

const KINDS = new Set(['attributes', 'features', 'assurances'])

export function saveLibraryItem(kind, item) {
  if (!KINDS.has(kind)) throw new Error(`Unknown library kind "${kind}".`)
  const library = getLibrary()
  const list = library[kind].slice()
  const i = list.findIndex((x) => x.id === item.id || (item.key && x.key === item.key))
  const next = { id: item.id || uid(kind.slice(0, -1)), ...list[i], ...item }
  if (i >= 0) list[i] = next
  else list.unshift(next)
  persist({ ...cache, library: { ...library, [kind]: list } })
  return next
}

export function deleteLibraryItem(kind, id) {
  if (!KINDS.has(kind)) throw new Error(`Unknown library kind "${kind}".`)
  const library = getLibrary()
  persist({ ...cache, library: { ...library, [kind]: library[kind].filter((x) => x.id !== id) } })
  return { ok: true }
}

/**
 * Learn from a product as it is saved.
 *
 * Anything described here that the built-in vocabulary does not know becomes a
 * suggestion on the next product, and every value seen against a key joins that
 * key's list. This is the "promote unrecognised keys for review" job the schema
 * notes describe, run inline — a merchant should not have to decide to save
 * something in order to be offered it again.
 *
 * `known` is passed in rather than imported so this file stays free of the
 * data layer above it.
 */
/** `collar_type` and `collarType` both read as "Collar type". */
function humanise(key) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}

export function learnFrom(product, known = new Set()) {
  const e = product.enrichment || {}
  const pairs = [
    ...(e.highlights || []).map((h) => [h.key, h.value]),
    ...Object.entries(e.specs || {}),
  ].filter(([k, v]) => k && v)
  if (!pairs.length) return

  const library = getLibrary()
  const byKey = new Map(library.attributes.map((a) => [a.key, a]))
  let touched = false

  for (const [key, value] of pairs) {
    if (known.has(key)) continue
    const existing = byKey.get(key)
    const values = new Set(existing?.values || [])
    const before = values.size
    values.add(String(value))
    if (existing && values.size === before) continue
    byKey.set(key, {
      id: existing?.id || uid('attribute'),
      key,
      // "collarType" and "collar_type" both read as "Collar type".
      label: existing?.label || humanise(key),
      group: existing?.group || 'general',
      values: [...values].slice(0, 24),
      custom: true,
    })
    touched = true
  }

  if (touched) persist({ ...cache, library: { ...library, attributes: [...byKey.values()] } })
}

export function updateSettings(patch) {
  const settings = deepMerge(getSettings(), patch)
  persist({ ...cache, settings })
  return settings
}

/** Arrays replace wholesale — see StorefrontContext for why. */
function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base?.[k] ?? {}, v) : v
  }
  return out
}

/* ── bulk ──────────────────────────────────────────────────────────────── */

/**
 * Import a catalogue. `mode: 'merge'` upserts by slug, `'replace'` swaps the
 * whole set. This is the shape a nightly ERP dump wants, and the reason the
 * write API documents a bulk endpoint rather than expecting a thousand POSTs.
 */
export function importCatalog({ products = [], categories = [], collections = [], sizeCharts = [], settings, mode = 'merge' }) {
  let next = { ...cache }
  if (mode === 'replace') {
    if (products.length) next.products = products
    if (categories.length) next.categories = categories
    if (collections.length) next.collections = collections
  } else {
    if (products.length) {
      const bySlug = new Map(getProducts().map((p) => [p.slug, p]))
      products.forEach((p) => bySlug.set(p.slug, { ...bySlug.get(p.slug), ...p, updatedAt: nowIso() }))
      next.products = [...bySlug.values()]
    }
    if (categories.length) {
      const bySlug = new Map(getCategories().map((c) => [c.slug, c]))
      categories.forEach((c) => bySlug.set(c.slug, { ...bySlug.get(c.slug), ...c }))
      next.categories = [...bySlug.values()]
    }
    if (collections.length) {
      const bySlug = new Map(getCollections().map((c) => [c.slug, c]))
      collections.forEach((c) => bySlug.set(c.slug, { ...bySlug.get(c.slug), ...c }))
      next.collections = [...bySlug.values()]
    }
  }
  if (sizeCharts.length) {
    const byId = new Map(getSizeCharts().map((c) => [c.id, c]))
    sizeCharts.forEach((c) => byId.set(c.id, { ...byId.get(c.id), ...c }))
    next.sizeCharts = [...byId.values()]
  }
  if (settings) next.settings = deepMerge(next.settings, settings)
  persist(next)
  return {
    products: next.products.length,
    categories: next.categories.length,
    collections: next.collections.length,
  }
}

export function exportCatalog() {
  return {
    version: VERSION,
    exportedAt: nowIso(),
    products: getProducts(),
    categories: getCategories(),
    collections: getCollections(),
    sizeCharts: getSizeCharts(),
    settings: getSettings(),
  }
}

export async function resetToSeed() {
  persist(await seed())
  return cache
}

export default {
  ready, snapshot, subscribe,
  getProducts, getCategories, getCollections, getSettings, getSizeCharts, upsertSizeChart,
  upsertProduct, deleteProduct, adjustInventory, setInventory,
  upsertCategory, deleteCategory, updateSettings,
  importCatalog, exportCatalog, resetToSeed,
}
