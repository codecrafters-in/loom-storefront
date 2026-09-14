/**
 * The bundled backend.
 *
 * Implements the whole contract in the browser against src/data/catalog.js, so
 * the theme is fully explorable — filter, add to cart, check out, look at an
 * order — with nothing running behind it. Anything that would live in a
 * database lives in localStorage instead.
 *
 * Two things here are deliberate rather than lazy:
 *
 *  - Every call goes through `latency()`. Without it the loading states are
 *    never exercised, and the first time anyone points this at a real API every
 *    skeleton and spinner is discovered to be broken.
 *  - Money arithmetic happens in integer minor units, exactly as it would
 *    server-side, so the totals a designer sees here are the totals a customer
 *    will see later.
 */
import * as db from '../db.js'
import { railKey } from './railKey.js'
import { attributes, attributeGroups, assuranceTemplates, featureIcons } from '../../data/attributes.js'
// regions.js and admin-orders.js are imported where they are used, not here: see getCountry and orderKit.
import { config } from '../config.js'
import { ApiError } from './contracts.js'
import { invalidateAndNotify } from './cache.js'
import { comboState, keyOf, modelOf, optionsOf, variantFor } from '../variants.js'
import { ruleOf } from '../quantity.js'

/**
 * The catalogue is read from the demo database, not from a static import.
 *
 * That indirection is what lets the admin panel write. `latency()` doubles as
 * the point where this module picks up the current data — every endpoint awaits
 * it already, so there is no separate "load" step to forget.
 */
export let products = []
let categories = []
let collections = []
let sizeCharts = []
let brands = []
export let storefront = {}

export function adopt() {
  products = db.getProducts()
  categories = db.getCategories()
  collections = db.getCollections()
  brands = db.getBrands()
  sizeCharts = db.getSizeCharts()
  storefront = db.getSettings()
}
/**
 * A write from this tab has already been purged precisely by `PURGES`. One
 * from another tab has not been purged at all, and cannot be — nothing here
 * knows what it touched.
 */
let watching = false
/**
 * Subscribed on the first call, not when the module loads: an import with no
 * side effects is one a live-store build can leave out entirely.
 */
function watch() {
  if (watching) return
  watching = true
  db.subscribe((_next, origin) => {
    adopt()
    if (origin === 'remote') invalidateAndNotify()
  })
}

export const CURRENCY = config.store.currency
export const nowIso = () => new Date().toISOString()
export const KEY = {
  discounts: 'loom.discounts',
  cart: 'loom.cart',
  orders: 'loom.orders',
  session: 'loom.session',
  wishlist: 'loom.wishlist',
  customer: 'loom.customer',
  // Orders placed from this browser, signed in or not. A guest needs to reach
  // the confirmation page for the order they just placed, and an order id is
  // the only thing they have.
  placed: 'loom.placed',
  // Status only. See `saveCredentials` for why there is no value in here.
  credentials: 'loom.credentials',
  // idempotency_key → order id. A provider retrying a webhook must not place a
  // second order for the same money.
  idempotency: 'loom.idempotency',
  // On-site payments by id. A real backend keeps these as transactions.
  payments: 'loom.payments',
}

export async function latency() {
  await db.ready()
  watch()
  adopt()
  if (config.mockLatency > 0) {
    await new Promise((r) => setTimeout(r, config.mockLatency + Math.random() * config.mockLatency))
  }
}

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback // private mode, quota, or a stale shape from an older build
  }
}
export function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — the session simply will not persist */
  }
}

export const money = (amount) => ({ amount, currency: CURRENCY })
export const id = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`

const isLive = (p) => Boolean(p) && p.published !== false
const inStock = (p) => (p.variants || []).some((v) => v.available)

/** The store's stock setting under the product's own, as `{ display, lowThreshold }`. */
function stockOf(p) {
  const { display, lowThreshold } = { display: 'low', lowThreshold: 3, ...(storefront.commerce?.stock || {}), ...(p?.stock || {}) }
  return { display, lowThreshold }
}

/** `[{ slug, name }]`, root first. Stops at a loop in the parents rather than hanging on one. */
function categoryPath(slug) {
  const path = []
  const seen = new Set()
  let c = categories.find((x) => x.slug === slug)
  while (c && !seen.has(c.slug)) {
    seen.add(c.slug)
    path.unshift({ slug: c.slug, name: c.name })
    c = c.parent ? categories.find((x) => x.slug === c.parent) : null
  }
  return path
}

/** The trail to the product's deepest category — where a shopper would say it lives. */
const breadcrumbsOf = (slugs = []) =>
  slugs.map(categoryPath).reduce((best, path) => (path.length > best.length ? path : best), [])

/**
 * `ProductSummary`: enough for a rail, a chip or a dialog, and no variants.
 * `variantId` only when there is exactly one to add; otherwise the shopper has
 * choices to make on the product's page.
 */
const summaryOf = (p) => ({
  slug: p.slug,
  title: p.title,
  price: p.price,
  compareAtPrice: p.compareAtPrice ?? null,
  image: p.images?.[0] || null,
  available: inStock(p),
  type: p.type || 'goods',
  variantId: p.variants?.length === 1 ? p.variants[0].id : null,
})
const summaries = (slugs) => (slugs || []).map((s) => products.find((x) => x.slug === s)).filter(isLive).map(summaryOf)

/** A combo item with its title, photograph and stock read live, so a set never offers a pen that sold out. */
function liveComboItem(item) {
  const p = products.find((x) => x.slug === item.productSlug)
  const v = p?.variants.find((x) => x.id === item.variantId)
  return {
    id: item.id,
    variantId: item.variantId,
    productSlug: item.productSlug,
    title: p?.title || item.title || '',
    image: (p?.images || []).find((i) => i.id === v?.imageId) || p?.images?.[0] || null,
    options: v?.options || {},
    extraPrice: item.extraPrice || money(0),
    available: Boolean(isLive(p) && v?.available),
  }
}

/**
 * A stored product as the API serves it.
 *
 * Strips what only the image script and this adapter read, resolves the size
 * chart, and brings a product authored the old way — options by name, no ids —
 * up to the current contract, so a shirt and a phone arrive in the same shape.
 * `detail` adds what only the product page reads: breadcrumbs, extra options,
 * the combo and the related lists.
 */
function publicProduct(p, { detail = false } = {}) {
  const {
    _imageQuery, _altQuery, _colorQuery, sizeChartId, optionalProductSlugs, accessorySlugs, alternativeSlugs,
    download: _download, extraOptions, combo, ...rest
  } = p
  // A product either references a shared chart by id or carries its own. The
  // reference is resolved here so the storefront always sees one shape.
  const chart = sizeChartId ? sizeCharts.find((c) => c.id === sizeChartId) : rest.sizeChart
  const options = optionsOf(rest)
  const stock = stockOf(rest)
  const rule = ruleOf(rest.quantity)
  const shaped = {
    ...rest,
    type: rest.type || 'goods',
    brand: rest.brand || null,
    options,
    // A store that does not publish stock levels must not publish them in the payload either.
    variants: (rest.variants || []).map((v) => ({
      ...v,
      optionIds: keyOf(v, options),
      inventory: stock.display === 'hidden' ? null : v.inventory,
    })),
    stock,
    quantity: { ...rule, unit: rule.unit || 'Units' },
    sizeChartId: sizeChartId ?? rest.sizeChart?.id ?? null,
    sizeChart: chart || null,
    enrichment: rest.enrichment?.specList
      ? { ...rest.enrichment, specList: rest.enrichment.specList.map(({ facet: _facet, ...s }) => s) }
      : rest.enrichment,
  }
  if (!detail) return shaped
  return {
    ...shaped,
    breadcrumbs: breadcrumbsOf(rest.categories),
    extraOptions: extraOptions || [],
    ...(combo ? { combo: combo.map((g) => ({ ...g, items: g.items.map(liveComboItem) })) } : {}),
    optionalProducts: summaries(optionalProductSlugs),
    accessories: summaries(accessorySlugs),
    alternatives: summaries(alternativeSlugs),
  }
}

/**
 * The admin's view: the record as stored, with the chart resolved and nothing
 * derived. The editor writes back what it reads, and a derived `choices` list
 * saved into a Colour/Size product would go stale the first time a colour was
 * added.
 */
export function storedProduct(p) {
  const { _imageQuery, _altQuery, _colorQuery, sizeChartId, ...rest } = p
  const chart = sizeChartId ? sizeCharts.find((c) => c.id === sizeChartId) : rest.sizeChart
  return { ...rest, sizeChartId: sizeChartId ?? rest.sizeChart?.id ?? null, sizeChart: chart || null }
}

/* ── catalogue ─────────────────────────────────────────────────────────── */

/**
 * Sorts read through accessors rather than dotting into the record.
 *
 * Writes are normalised, but an imported catalogue or a hand-edited store can
 * still hold a product missing `rating` — and a comparator is a bad place to
 * find that out, because it takes down the whole listing rather than one card.
 */
const count = (p) => p.rating?.count ?? 0
const average = (p) => p.rating?.average ?? 0
const amount = (p) => p.price?.amount ?? 0

const SORTS = {
  featured: (a, b) => count(b) - count(a),
  newest: (a, b) => ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1),
  'price-asc': (a, b) => amount(a) - amount(b),
  'price-desc': (a, b) => amount(b) - amount(a),
  rating: (a, b) => average(b) - average(a),
}

/** `['Color:Ecru', 'Color:Navy', 'Size:M']` → `Map { Color → [Ecru, Navy], Size → [M] }`. A value may hold a colon; a key may not. */
function pairsOf(list) {
  const map = new Map()
  for (const pair of [].concat(list || [])) {
    const text = String(pair)
    const at = text.indexOf(':')
    if (at < 1) continue
    map.set(text.slice(0, at), [...(map.get(text.slice(0, at)) || []), text.slice(at + 1)])
  }
  return map
}

/** Whether a product is sold in any of these values of one option. Either within a group, all groups together. */
function hasValue(p, optionId, names) {
  const options = optionsOf(p)
  const option = options.find((o) => o.id === optionId)
  const ids = new Set((option?.choices || []).filter((c) => names.includes(c.name)).map((c) => c.id))
  if (!ids.size) return false
  // A dynamic option's values are made when bought, so offering the value is enough.
  if (option.mode === 'dynamic') return true
  return (p.variants || []).some((v) => ids.has(keyOf(v, options)[optionId]))
}

export async function listProducts(query = {}) {
  await latency()
  return listProductsSync(query)
}

function listProductsSync(query = {}) {
  const {
    category,
    collection,
    q,
    sizes = [],
    colors = [],
    tags = [],
    minPrice,
    maxPrice,
    sort = 'featured',
    page = 1,
    perPage = 12,
    inStock = false,
    attr = [],
    spec = [],
    brand = [],
    inBrand,
  } = query

  // Drafts are invisible to shoppers. `includeDrafts` is only ever passed by
  // the admin adapter, so a storefront call can never leak an unfinished
  // product no matter what the caller asks for.
  let items = products.filter((p) => p.published !== false)

  if (category) {
    // Filtering by a parent has to include its children, or /shop/shirts is
    // empty while /shop/shirts-linen is not.
    const scope = new Set(descendants(category))
    items = items.filter((p) => p.categories.some((c) => scope.has(c)))
  }
  if (collection) {
    const c = collections.find((x) => x.slug === collection)
    items = c ? items.filter((p) => c.productSlugs.includes(p.slug)) : []
  }
  // A brand page's scope, like a category (`brand` is the filter a shopper sets).
  if (inBrand) items = items.filter((p) => p.brand?.slug === inBrand)
  if (q) {
    const needle = q.toLowerCase()
    items = items.filter((p) =>
      [p.title, p.subtitle, p.description, ...(p.tags || []), ...(p.categories || [])]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }
  if (sizes.length) items = items.filter((p) => (p.variants || []).some((v) => sizes.includes(v.options.Size) && v.available))
  if (colors.length) items = items.filter((p) => (p.options || []).find((o) => o.name === 'Color')?.values.some((c) => colors.includes(c)))
  if (tags.length) items = items.filter((p) => tags.some((t) => (p.tags || []).includes(t)))
  if (Number.isFinite(minPrice)) items = items.filter((p) => amount(p) >= minPrice)
  if (Number.isFinite(maxPrice)) items = items.filter((p) => amount(p) <= maxPrice)
  if (inStock) items = items.filter((p) => (p.variants || []).some((v) => v.available))
  for (const [optionId, names] of pairsOf(attr)) items = items.filter((p) => hasValue(p, optionId, names))
  for (const [key, values] of pairsOf(spec)) {
    items = items.filter((p) => (p.enrichment?.specList || []).some((s) => s.key === key && values.includes(String(s.value))))
  }
  const brandSlugs = [].concat(brand || []).filter(Boolean)
  if (brandSlugs.length) items = items.filter((p) => brandSlugs.includes(p.brand?.slug))
  if (storefront.commerce?.stock?.hideSoldOut) items = items.filter(inStock)

  items.sort(SORTS[sort] || SORTS.featured)

  const total = items.length
  const start = (page - 1) * perPage

  const facetScope = (category
    ? products.filter((p) => {
        const scope = new Set(descendants(category))
        return p.categories.some((c) => scope.has(c))
      })
    : products
  ).filter((p) => !inBrand || p.brand?.slug === inBrand)

  return {
    items: items.slice(start, start + perPage).map((p) => publicProduct(p)),
    total,
    page,
    perPage,
    // Facets are computed from the *unfiltered* set so a filter panel never
    // hides the option you would need to widen your own search.
    facets: buildFacets(facetScope),
  }
}

function buildFacets(scope) {
  const sizes = new Set()
  const colors = new Map()
  const tags = new Set()
  let min = Infinity
  let max = 0
  for (const p of scope) {
    ;(p.options || []).find((o) => o.name === 'Size')?.values.forEach((s) => sizes.add(s))
    ;(p.options || []).find((o) => o.name === 'Color')?.values.forEach((c) => colors.set(c, p.swatches?.[c] || '#ccc'))
    ;(p.tags || []).forEach((t) => tags.add(t))
    min = Math.min(min, amount(p))
    max = Math.max(max, amount(p))
  }
  const order = ['XS', 'S', 'M', 'L', 'XL', 'One Size']
  return {
    sizes: [...sizes].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    colors: [...colors].map(([name, hex]) => ({ name, hex })),
    tags: [...tags].sort(),
    priceRange: { min: Number.isFinite(min) ? min : 0, max },
    ...anyFacets(scope, order),
  }
}

/**
 * The generic facets: every option, every specification marked as a facet,
 * every brand.
 *
 * Counted in products rather than variants. "Navy (12)" meaning twelve
 * navy-and-a-size pairs is a number nobody can use.
 */
function anyFacets(scope, sizeOrder) {
  const attributes = new Map()
  const specs = new Map()
  const brandCounts = new Map()
  for (const p of scope) {
    if (!isLive(p)) continue
    for (const o of optionsOf(p)) {
      const entry = attributes.get(o.id) || { id: o.id, name: o.name, displayType: o.displayType, role: o.role, values: new Map() }
      for (const c of o.choices) {
        const value = entry.values.get(c.name) || { name: c.name, color: c.color || null, count: 0 }
        value.count += 1
        entry.values.set(c.name, value)
      }
      attributes.set(o.id, entry)
    }
    for (const s of p.enrichment?.specList || []) {
      if (!s.facet) continue
      const entry = specs.get(s.key) || { key: s.key, label: s.label, group: s.groupLabel || s.group || null, unit: s.unit ?? null, values: new Map() }
      entry.values.set(String(s.value), (entry.values.get(String(s.value)) || 0) + 1)
      specs.set(s.key, entry)
    }
    if (p.brand?.slug) {
      const b = brandCounts.get(p.brand.slug) || { slug: p.brand.slug, name: p.brand.name, count: 0 }
      b.count += 1
      brandCounts.set(p.brand.slug, b)
    }
  }
  const rank = (name) => (sizeOrder.includes(name) ? sizeOrder.indexOf(name) : sizeOrder.length)
  return {
    attributes: [...attributes.values()].map((a) => ({
      ...a,
      values: [...a.values.values()].sort((x, y) => (a.role === 'size' ? rank(x.name) - rank(y.name) : 0)),
    })),
    specs: [...specs.values()].map((s) => ({ ...s, values: [...s.values].map(([value, count]) => ({ value, count })) })),
    brands: [...brandCounts.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function getProduct(slug) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p || p.published === false) {
    throw new ApiError(`No product with slug "${slug}".`, { status: 404, code: 'not_found' })
  }
  return publicProduct(p, { detail: true })
}

/**
 * Recommendations, by strategy.
 *
 * The strategy is configuration, not code — `storefront.recommendations` picks
 * one, so a merchant can move from "same category" to a scored feed without a
 * deploy. Every strategy falls back to best-sellers rather than returning an
 * empty rail, because an empty rail looks broken and a slightly-off rail does
 * not.
 */
export async function getRelated(slug, { limit = 4, strategy = 'automatic' } = {}) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p) return { items: [], total: 0, strategy }

  const others = products.filter((x) => x.slug !== slug && x.published !== false)
  let ranked = []

  switch (strategy) {
    case 'off':
      return { items: [], total: 0, strategy }

    case 'manual':
      ranked = (p.relatedSlugs || []).map((s) => others.find((x) => x.slug === s)).filter(Boolean)
      break

    case 'same-category':
      ranked = others
        .filter((x) => x.categories.some((c) => p.categories.includes(c)))
        .sort((a, b) => b.rating.count - a.rating.count)
      break

    case 'best-sellers':
      ranked = others.slice().sort((a, b) => b.rating.count - a.rating.count)
      break

    case 'automatic':
    default: {
      // Shared leaf category counts for more than a shared top-level one, and a
      // shared fabric tag counts for more than either — "another merino thing"
      // is a better suggestion than "another knit".
      const scored = others
        .map((x) => {
          const shared = x.categories.filter((c) => p.categories.includes(c))
          const leaf = shared.some((c) => categories.find((k) => k.slug === c)?.parent)
          return {
            x,
            score:
              (shared.length ? 2 : 0) +
              (leaf ? 3 : 0) +
              x.tags.filter((t) => p.tags.includes(t)).length * 2 +
              (Math.abs(x.price.amount - p.price.amount) < 5000 ? 1 : 0),
          }
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score || b.x.rating.count - a.x.rating.count)
      ranked = scored.map((s) => s.x)
      break
    }
  }

  if (ranked.length < limit) {
    const seen = new Set([slug, ...ranked.map((x) => x.slug)])
    ranked = ranked.concat(
      others.filter((x) => !seen.has(x.slug)).sort((a, b) => b.rating.count - a.rating.count),
    )
  }

  return { items: ranked.slice(0, limit).map((x) => publicProduct(x)), total: ranked.length, strategy }
}

/**
 * Categories come back as a tree. The source is flat with a `parent` pointer —
 * which is what a database stores and an admin panel edits — and the nesting is
 * built here, once, on read.
 */
export async function listCategories(opts) {
  await latency()
  return listCategoriesSync(opts)
}

export function listCategoriesSync({ tree = true } = {}) {
  const decorate = (c) => ({
    slug: c.slug,
    name: c.name,
    parent: c.parent ?? null,
    blurb: c.blurb,
    image: c.image || { url: `/images/categories/${c.slug}.jpg`, alt: c.name },
    count: countIn(c.slug),
    path: categoryPath(c.slug),
  })

  if (!tree) return { items: categories.map(decorate), total: categories.length }

  // Any depth. Only two levels were built here once, so a third-level category
  // was missing from the tree and its page could not find its own name.
  const node = (c, seen) => ({
    ...decorate(c),
    children: categories
      .filter((k) => k.parent === c.slug && !seen.has(k.slug))
      .map((k) => node(k, new Set([...seen, k.slug]))),
  })
  const items = categories.filter((c) => !c.parent).map((r) => node(r, new Set([r.slug])))
  return { items, total: items.length }
}

/** A parent's count includes everything filed under its children. */
function descendants(slug) {
  const kids = categories.filter((c) => c.parent === slug).map((c) => c.slug)
  return [slug, ...kids.flatMap(descendants)]
}
const countIn = (slug) => {
  const scope = new Set(descendants(slug))
  return products.filter((p) => p.categories.some((c) => scope.has(c))).length
}

/** The whole theme configuration. Mock mode serves the stored document. */
export async function getStorefront() {
  await latency()
  return storefront
}

/**
 * Everything the first screen needs, in one response.
 *
 * A home page that fetches settings, then categories, then collections, then
 * two product rails is five sequential round trips before anything is readable
 * — and on a real backend each one is a fresh connection, a fresh auth check
 * and a fresh database hit. Bundling them costs the server one query plan and
 * saves the client four waterfalls.
 *
 * `rails` is derived from the configured home sections, so adding a rail in
 * settings adds it to the bootstrap automatically rather than becoming a fifth
 * request.
 */
export async function getBootstrap() {
  await latency()
  const sections = (storefront.home || []).filter((s) => s.type === 'product-rail')
  const rails = {}
  for (const section of sections) {
    const src = section.source || {}
    const key = railKey(src)
    if (rails[key]) continue
    const { items } = await listProductsSync({
      sort: src.sort || 'featured',
      category: src.category,
      collection: src.collection,
      tags: src.tags,
      perPage: src.limit || 4,
    })
    rails[key] = items
  }
  const cats = await listCategoriesSync()
  return {
    storefront,
    categories: cats.items,
    collections: collectionsPublic(),
    rails,
    generatedAt: new Date().toISOString(),
  }
}



/* brands and combinations */

/* pages, contact, consent, access, blog */

export async function listPages() {
  await latency()
  const { pages } = await import('../../data/pages.js')
  const items = Object.entries(pages).map(([slug, p]) => ({ slug, title: p.title }))
  return { items, total: items.length }
}

export async function getPage(slug) {
  await latency()
  const { pages } = await import('../../data/pages.js')
  const page = pages[slug]
  if (!page) throw new ApiError(`No page with slug "${slug}".`, { status: 404, code: 'not_found' })
  return { slug, ...page, seo: { title: page.title, description: page.intro } }
}

export async function sendContact(message = {}) {
  await latency()
  if (!message.name || !message.email || !message.message) {
    throw new ApiError('Please enter your name, a valid email address and a message.', { status: 422, code: 'missing_fields' })
  }
  return { ok: true, id: `msg_${Date.now()}` }
}

export async function recordConsent() {
  await latency()
  return { ok: true }
}

export async function requestAccess() {
  await latency()
  return { token: 'demo', header: 'X-Loom-Access', expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString() }
}

export async function adminAccess() {
  return requestAccess()
}

export async function listBlogPosts({ page = 1, perPage = 12 } = {}) {
  await latency()
  return { items: [], total: 0, page, perPage, blogs: [], tags: [] }
}

export async function getBlogPost(slug) {
  await latency()
  throw new ApiError(`No post with slug "${slug}".`, { status: 404, code: 'not_found' })
}

/** The demo's downloads are static files the browser follows as plain links. */
export async function downloadFile() {
  return null
}

export async function listBrands() {
  await latency()
  const items = brands.map((b) => ({
    slug: b.slug,
    name: b.name,
    logo: b.logo || null,
    description: b.description || '',
    count: products.filter((p) => isLive(p) && p.brand?.slug === b.slug).length,
  }))
  return { items, total: items.length }
}

export async function getBrand(slug) {
  await latency()
  const b = brands.find((x) => x.slug === slug)
  if (!b) throw new ApiError(`No brand with slug "${slug}".`, { status: 404, code: 'not_found' })
  return {
    slug: b.slug,
    name: b.name,
    logo: b.logo || null,
    description: b.description || '',
    seo: b.seo || { title: b.name, description: b.description || '' },
  }
}

/**
 * The price and stock of a set of choices that `variants[]` cannot answer: a
 * dynamic option nobody has bought yet, or an engraving on top.
 */
export async function getCombination(slug, choiceIds = []) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!isLive(p)) throw new ApiError(`No product with slug "${slug}".`, { status: 404, code: 'not_found' })
  const quote = priceChoices(p, choiceIds, [], { incomplete: 'invalid_combination' })
  const compareAt = quote.variant.compareAtPrice
  return {
    exists: !quote.variant.dynamic,
    variantId: quote.variant.dynamic ? null : quote.variant.id,
    available: quote.variant.available,
    price: money(quote.unit),
    compareAtPrice: compareAt ? money(compareAt.amount + quote.extraAmount) : null,
    imageId: quote.variant.imageId ?? null,
  }
}

export async function listCollections() {
  await latency()
  return collectionsPublic()
}

const collectionsPublic = () => ({
  items: collections.map((c) => ({
    slug: c.slug,
    title: c.title,
    blurb: c.blurb,
    image: { url: `/images/collections/${c.slug}.jpg`, alt: c.title },
    count: c.productSlugs.length,
  })),
  total: collections.length,
})

/* ── reviews ───────────────────────────────────────────────────────────── */

const NAMES = ['Priya S.', 'Daniel R.', 'Mei L.', 'Tomás A.', 'Aisha K.', 'Jon W.', 'Elena V.', 'Rahul M.']
const BODIES = [
  'Exactly as described. The weight is the thing — it hangs properly instead of clinging.',
  'Second one of these. The first is two years old and still holds its shape.',
  'Runs true to size for me. I am usually between sizes and took the smaller.',
  'Fabric is genuinely lovely. Took one star off because delivery took a week longer than quoted.',
  'Sized up for a looser fit and it worked well. Would buy in another colour.',
  'Worth the money, which is not something I say often about a shirt.',
  'Ordered two sizes and kept this one. The measurements on the size chart were accurate.',
  'Washed it three times and it has not pilled. That is the whole reason I bought it.',
]
const HEIGHTS = ['5\'4"', '5\'7"', '5\'9"', '5\'11"', '6\'0"', '6\'2"']
const FIT_WORDS = ['small', 'true', 'large']
const PLAIN_BODIES = [
  'Exactly as described, and better made than the photographs suggest.',
  'Second one I have bought. The first is still going.',
  'Arrived two days early and very well packed.',
  'Worth the money, which is not something I say often.',
  'Took one star off because delivery took a week longer than quoted.',
]

export async function getReviews(slug, { page = 1, perPage = 5 } = {}) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p) throw new ApiError('Unknown product.', { status: 404, code: 'not_found' })
  const n = Math.min(p.rating.count, 12)
  // Size, height and fit only where there is a size to have bought. A review
  // of a phone that "runs small" is noise.
  const sizes = optionsOf(p).find((o) => o.role === 'size')?.values || null
  const bodies = sizes ? BODIES : PLAIN_BODIES
  const items = Array.from({ length: n }, (_, i) => ({
    id: `rev_${slug}_${i}`,
    author: NAMES[(i * 3) % NAMES.length],
    rating: i % 7 === 0 ? 4 : i % 11 === 0 ? 3 : 5,
    title: '',
    body: bodies[(i * 5) % bodies.length],
    createdAt: new Date(2026, 7, 28 - i * 3).toISOString(),
    verified: i % 4 !== 0,
    // The fields that make a review useful on an apparel page rather than
    // decorative: what they bought, how tall they are, how it fitted.
    size: sizes ? sizes[i % sizes.length] : undefined,
    height: sizes && p.fit?.model ? HEIGHTS[i % HEIGHTS.length] : null,
    fit: sizes ? FIT_WORDS[i % 9 === 0 ? 0 : i % 7 === 0 ? 2 : 1] : undefined,
    photos: i % 5 === 0 ? [p.images[1]] : [],
  }))
  const start = (page - 1) * perPage
  return {
    items: items.slice(start, start + perPage),
    total: p.rating.count,
    summary: {
      average: p.rating.average,
      count: p.rating.count,
      breakdown: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: Math.round(p.rating.count * [0.72, 0.19, 0.05, 0.02, 0.02][5 - stars]),
      })),
      // Aggregated from purchasers, not from the brand's own view of its cut.
      fit: p.fit?.feedback || null,
      withPhotos: items.filter((r) => r.photos.length).length,
    },
  }
}

/* ── cart ──────────────────────────────────────────────────────────────── */

/** Seeded, then owned by the merchant through the admin screen. */
const SEED_DISCOUNTS = [
  { code: 'LOOM10', label: '10% off', kind: 'percent', value: 10, active: true },
  { code: 'WELCOME15', label: '15% off your first order', kind: 'percent', value: 15, active: true },
  { code: 'FREESHIP', label: 'Free shipping', kind: 'shipping', value: 0, active: true },
]

export const discounts = () => read(KEY.discounts, SEED_DISCOUNTS)
const discountByCode = (code) =>
  discounts().find((d) => d.code === String(code || '').toUpperCase() && d.active !== false)

const shippingFlat = () => storefront.commerce?.shippingMethods?.[0]?.price ?? 1200

export const emptyCart = () => ({
  id: id('cart'),
  lines: [],
  discountCode: null,
  currency: CURRENCY,
})

export function priceCart(cart) {
  // Rounded per line: a quarter kilo of coffee at an odd price is a fraction of
  // a cent, and money only ever crosses the boundary in whole minor units.
  const subtotalAmount = cart.lines.reduce((a, l) => a + Math.round(l.unitPrice.amount * l.quantity), 0)
  const rule = cart.discountCode ? discountByCode(cart.discountCode.code) : null

  const discountAmount =
    rule?.kind === 'percent'
      ? Math.round((subtotalAmount * rule.value) / 100)
      : rule?.kind === 'fixed'
        ? Math.min(subtotalAmount, rule.value)
        : 0
  const afterDiscount = subtotalAmount - discountAmount

  // The admin-editable value, not the build-time env default — otherwise the
  // product page promises free shipping the cart still charges for.
  const freeOver = storefront.commerce?.freeShippingOver ?? config.store.freeShippingOver * 100
  const shippingFree = rule?.kind === 'shipping' || afterDiscount >= freeOver || cart.lines.length === 0
  const shippingAmount = shippingFree ? 0 : shippingFlat()

  // A flat 8% stands in for a real tax engine. Swap this out server-side —
  // never compute tax in the browser for a live store.
  const taxAmount = Math.round(afterDiscount * 0.08)

  return {
    ...cart,
    lines: cart.lines.map((l) => ({ ...l, lineTotal: money(Math.round(l.unitPrice.amount * l.quantity)) })),
    subtotal: money(subtotalAmount),
    discount: money(discountAmount),
    shipping: money(shippingAmount),
    tax: money(taxAmount),
    total: money(afterDiscount + shippingAmount + taxAmount),
    freeShippingThreshold: money(freeOver),
    freeShippingRemaining: money(Math.max(0, freeOver - afterDiscount)),
  }
}

export function loadCart() {
  const stored = read(KEY.cart, null)
  return stored && Array.isArray(stored.lines) ? stored : emptyCart()
}
/** A line as the API returns it, without this adapter's bookkeeping. */
const publicLine = ({ _components, _untracked, ...line }) => line
const publicCart = (cart) => ({ ...cart, lines: cart.lines.map(publicLine) })

export function saveCart(cart) {
  const { lines, id: cartId, discountCode, currency } = cart
  write(KEY.cart, { id: cartId, lines, discountCode, currency })
  return publicCart(priceCart(cart))
}

export async function getCart() {
  await latency()
  return publicCart(priceCart(loadCart()))
}

const refuse = (message, code = 'invalid_combination', detail) => new ApiError(message, { status: 422, code, detail })

/**
 * Choice ids to a variant, the extras on top, and a unit price.
 *
 * Shared by the combination quote and the bag, so the price a shopper is shown
 * before adding is, by construction, the price the line is added at.
 */
function priceChoices(p, choiceIds = [], extraChoiceIds = [], { incomplete = 'choose_options' } = {}) {
  const shaped = publicProduct(p, { detail: true })
  const model = modelOf(shaped)
  const selection = {}
  const extras = []
  for (const choiceId of [...(choiceIds || []), ...(extraChoiceIds || [])].map(String)) {
    const option = model.options.find((o) => o.choices.some((c) => c.id === choiceId))
    if (option) {
      if (selection[option.id] && selection[option.id] !== choiceId) throw refuse(`Choose one ${option.name.toLowerCase()}.`)
      selection[option.id] = choiceId
      continue
    }
    const extra = model.extras.find((o) => o.choices.some((c) => c.id === choiceId))
    if (!extra) throw refuse('That choice is not offered on this product.')
    if (!extra.multiple && extras.some((x) => x.option.id === extra.id)) throw refuse(`Choose one ${extra.name.toLowerCase()}.`)
    extras.push({ option: extra, choice: extra.choices.find((c) => c.id === choiceId) })
  }
  const missing = [
    ...model.options.filter((o) => selection[o.id] == null),
    ...model.extras.filter((o) => o.required && !extras.some((x) => x.option.id === o.id)),
  ].map((o) => o.name)
  if (missing.length) {
    throw incomplete === 'choose_options'
      ? refuse(`Choose ${missing.join(' and ')} first.`, 'choose_options', { missing })
      : refuse(`Choose ${missing.join(' and ')} first.`)
  }

  let variant = variantFor(model, selection)
  if (variant) {
    // The stored variant, with its real stock, not the served one.
    variant = p.variants.find((v) => v.id === variant.id)
  } else if (model.dynamic) {
    // Made when bought: the base price plus what the chosen values add, which
    // is how Odoo prices a variant it has not created yet.
    const chosen = model.options.map((o) => o.choices.find((c) => c.id === selection[o.id]))
    variant = {
      id: `${p.slug}~${chosen.map((c) => c.id).join('+')}`,
      options: Object.fromEntries(model.options.map((o, i) => [o.name, chosen[i].name])),
      price: money(p.price.amount + chosen.reduce((sum, c) => sum + (c.priceExtra?.amount || 0), 0)),
      compareAtPrice: null,
      inventory: null,
      available: true,
      imageId: null,
      dynamic: true,
    }
  } else {
    throw refuse('That combination is not made. Try another choice.')
  }
  const extraAmount = extras.reduce((sum, x) => sum + (x.choice.priceExtra?.amount || 0), 0)
  return { shaped, model, variant, extras, extraAmount, unit: variant.price.amount + extraAmount }
}

/** A sentence about stock that does not say how much there is when the store does not. */
const shortage = (p, left) =>
  stockOf(p).display === 'hidden' || typeof left !== 'number' ? 'There is not enough of that in stock.' : `Only ${left} left.`

const EPSILON = 1e-6

/** `422 quantity_rule` for a quantity the product is not sold in. */
function checkQuantity(p, quantity) {
  const rule = ruleOf(p?.quantity)
  const steps = (quantity - rule.min) / rule.step
  const wrong =
    !Number.isFinite(quantity) ||
    quantity < rule.min - EPSILON ||
    (rule.max != null && quantity > rule.max + EPSILON) ||
    (!rule.decimals && !Number.isInteger(quantity)) ||
    Math.abs(steps - Math.round(steps)) > EPSILON
  if (wrong) {
    throw new ApiError('That quantity is not available.', {
      status: 422,
      code: 'quantity_rule',
      detail: { min: rule.min, max: rule.max, step: rule.step },
    })
  }
}

/**
 * A bag line from a request, refusing anything a real backend would.
 *
 * Nothing is written here. `addToCart` builds the main line and every optional
 * product before placing any of them, so an accessory that has sold out
 * refuses the whole add rather than leaving the phone in the bag without the
 * case it was chosen with.
 */
function buildLine(body = {}) {
  const quantity = Number(body.quantity ?? 1)
  let p
  let variant
  let quote = null
  if (body.variantId) {
    p = products.find((x) => x.variants.some((v) => v.id === body.variantId))
    variant = p?.variants.find((v) => v.id === body.variantId)
    if (!variant || !isLive(p)) throw new ApiError('That variant does not exist.', { status: 404, code: 'variant_not_found' })
  } else {
    p = products.find((x) => x.slug === body.productSlug)
    if (!isLive(p)) throw new ApiError('That product does not exist.', { status: 404, code: 'not_found' })
    quote = priceChoices(p, body.choiceIds, body.extraChoiceIds)
    variant = quote.variant
  }
  checkQuantity(p, quantity)
  if (!variant.available) throw new ApiError('That choice is out of stock.', { status: 409, code: 'out_of_stock' })

  const shaped = quote?.shaped || publicProduct(p, { detail: true })
  const model = quote?.model || modelOf(shaped)
  const sent = new Set([...(body.choiceIds || []), ...(body.extraChoiceIds || [])].map(String))
  const everyChoice = [...model.options, ...model.extras].flatMap((o) => o.choices)
  const customValues = (body.customValues || [])
    .map(({ choiceId, text }) => {
      const c = everyChoice.find((x) => x.id === String(choiceId))
      if (!c?.custom || !sent.has(c.id)) throw refuse('That text belongs to a choice that was not made.')
      const value = String(text ?? '').trim()
      if (value.length > 200) throw refuse('Keep the text to 200 characters.')
      return { name: c.name, text: value }
    })
    .filter((c) => c.text)

  let unit = quote ? quote.unit : variant.price.amount
  const components = []
  const comboItems = []
  if (shaped.type === 'combo') {
    const groups = shaped.combo || []
    const picks = {}
    for (const chosen of body.comboItems || []) {
      const group = groups.find((g) => g.items.some((i) => i.id === String(chosen.comboItemId)))
      if (group) picks[group.id] = String(chosen.comboItemId)
    }
    const state = comboState(groups, picks)
    if (!state.complete) {
      const names = state.missing.map((g) => g.name)
      throw new ApiError(`Choose one for ${names.join(' and ')}.`, { status: 422, code: 'combo_incomplete', detail: { groups: names } })
    }
    for (const g of groups) {
      const item = g.items.find((i) => i.id === picks[g.id])
      if (!item.available) throw new ApiError(`${item.title} is sold out.`, { status: 409, code: 'out_of_stock' })
      components.push(item.variantId)
      comboItems.push({ title: item.title, options: item.options, quantity })
    }
    unit += state.extra
  }

  const tracked = !variant.dynamic
  if (tracked && quantity > variant.inventory) {
    throw new ApiError(shortage(p, variant.inventory), { status: 409, code: 'insufficient_inventory' })
  }
  const extraOptions = {}
  for (const { option, choice } of quote?.extras || []) {
    extraOptions[option.name] = extraOptions[option.name] ? `${extraOptions[option.name]}, ${choice.name}` : choice.name
  }
  const rule = ruleOf(p.quantity)
  return {
    variantId: variant.id,
    productSlug: p.slug,
    title: p.title,
    options: variant.options,
    extraOptions,
    customValues,
    comboItems,
    image: p.images.find((i) => i.id === variant.imageId) || p.images[0],
    quantity,
    unitPrice: money(unit),
    lineTotal: money(Math.round(unit * quantity)),
    linkedTo: null,
    quantityRule: { ...rule, unit: rule.unit || 'Units' },
    // This adapter's own bookkeeping, stripped from every response: what a set
    // takes out of stock, and whether the variant is counted at all.
    _components: components,
    _untracked: !tracked,
  }
}

/** Put a built line in the bag, or grow the identical line already there. */
function placeLine(cart, line) {
  const identity = (l) =>
    JSON.stringify([l.variantId, l.linkedTo || null, l.extraOptions || {}, l.customValues || [], (l.comboItems || []).map((i) => [i.title, i.options])])
  const existing = cart.lines.find((l) => identity(l) === identity(line))
  if (!existing) {
    const placed = { id: id('line'), ...line }
    cart.lines.push(placed)
    return placed
  }
  const wanted = Math.round((existing.quantity + line.quantity) * 1000) / 1000
  const p = products.find((x) => x.slug === existing.productSlug)
  checkQuantity(p, wanted)
  const variant = p?.variants.find((v) => v.id === existing.variantId)
  if (!existing._untracked && variant && wanted > variant.inventory) {
    throw new ApiError(shortage(p, variant.inventory), { status: 409, code: 'insufficient_inventory' })
  }
  existing.quantity = wanted
  if (existing.comboItems?.length) existing.comboItems = existing.comboItems.map((i) => ({ ...i, quantity: wanted }))
  return existing
}

/** Removing a line removes what was added with it: a case without its phone was never the order. */
function removeLines(cart, lineId) {
  const gone = new Set([lineId])
  for (let grew = true; grew; ) {
    grew = false
    for (const l of cart.lines) {
      if (l.linkedTo && gone.has(l.linkedTo) && !gone.has(l.id)) {
        gone.add(l.id)
        grew = true
      }
    }
  }
  cart.lines = cart.lines.filter((l) => !gone.has(l.id))
  return saveCart(cart)
}

/**
 * `{ variantId }` as before, or `{ productSlug, choiceIds }` with extras, typed
 * text, a combo's items and optional products — the bodies in docs/API.md.
 */
export async function addToCart(body = {}) {
  await latency()
  const cart = loadCart()
  const main = buildLine(body)
  const optional = (body.optionalProducts || []).map((o) => buildLine({ variantId: o.variantId, quantity: o.quantity ?? 1 }))
  const placed = placeLine(cart, main)
  for (const line of optional) placeLine(cart, { ...line, linkedTo: placed.id })
  return saveCart(cart)
}

export async function updateCartLine(lineId, quantity) {
  await latency()
  const cart = loadCart()
  const line = cart.lines.find((l) => l.id === lineId)
  if (!line) throw new ApiError('That line is no longer in your bag.', { status: 404, code: 'line_not_found' })
  if (quantity <= 0) return removeLines(cart, lineId)
  const p = products.find((x) => x.slug === line.productSlug)
  if (p) checkQuantity(p, quantity)
  const variant = products.flatMap((x) => x.variants).find((v) => v.id === line.variantId)
  if (!line._untracked && variant && quantity > variant.inventory) {
    throw new ApiError(shortage(p, variant.inventory), { status: 409, code: 'insufficient_inventory' })
  }
  line.quantity = quantity
  // A set's contents follow its quantity.
  if (line.comboItems?.length) line.comboItems = line.comboItems.map((i) => ({ ...i, quantity }))
  return saveCart(cart)
}

export async function removeCartLine(lineId) {
  await latency()
  return removeLines(loadCart(), lineId)
}

export async function applyDiscount(code) {
  await latency()
  const cart = loadCart()
  const key = String(code || '').trim().toUpperCase()
  if (!key) {
    cart.discountCode = null
    return saveCart(cart)
  }
  const rule = discountByCode(key)
  if (!rule) throw new ApiError(`"${key}" is not a valid code.`, { status: 422, code: 'invalid_discount' })
  cart.discountCode = { code: key, label: rule.label }
  return saveCart(cart)
}

export async function clearCart() {
  await latency()
  return saveCart(emptyCart())
}

/* ── checkout and orders ───────────────────────────────────────────────── */

/**
 * Turn a priced cart into an order.
 *
 * Shared by `checkout()` — a shopper pressing the button — and
 * `adminPlaceOrder()` — a payment webhook reporting money that has already
 * moved. Extracted rather than copied because the stock re-check below is the
 * only thing standing between two shoppers and the same last unit, and a second
 * copy of it is a copy that will eventually stop matching the first.
 */
/**
 * Re-check stock against the catalogue, not against the cart.
 *
 * Availability was last checked when the line was added, which may have been
 * yesterday. Without this, two shoppers who both add the last unit both get a
 * confirmed order and one of them gets an email nobody can fulfil — and
 * because the decrement in `placeOrderFromCart` clamps at zero, nothing
 * anywhere records that it happened.
 */
function checkStock(cart) {
  const short = []
  const every = products.flatMap((p) => p.variants)
  for (const line of cart.lines) {
    // A set is in stock only while everything in it is.
    const setShort = (line._components || []).some((vid) => (every.find((v) => v.id === vid)?.inventory ?? 0) < line.quantity)
    if (line._untracked && !setShort) continue
    const variant = every.find((v) => v.id === line.variantId)
    if (setShort || !variant || variant.inventory < line.quantity) {
      short.push({
        variantId: line.variantId,
        title: line.title,
        options: line.options,
        wanted: line.quantity,
        available: variant?.inventory ?? 0,
      })
    }
  }
  if (short.length) {
    throw new ApiError(
      short.length === 1
        ? `${short[0].title} — only ${short[0].available} left.`
        : `${short.length} items in your bag are no longer available in that quantity.`,
      { status: 409, code: 'out_of_stock', detail: { lines: short } },
    )
  }
}

export function placeOrderFromCart(cart, { email, shippingAddress, shippingMethod = 'standard', payment }) {
  if (!cart.lines.length) throw new ApiError('Your bag is empty.', { status: 422, code: 'empty_cart' })
  if (!email) throw new ApiError('An email address is required.', { status: 422, code: 'email_required' })
  checkStock(cart)

  const orders = read(KEY.orders, [])
  const order = {
    id: id('order'),
    number: `LM-${10000 + orders.length + 428}`,
    status: 'placed',
    placedAt: new Date().toISOString(),
    lines: cart.lines.map(publicLine),
    subtotal: cart.subtotal,
    discount: cart.discount,
    shipping: cart.shipping,
    tax: cart.tax,
    total: cart.total,
    shippingAddress,
    shippingMethod,
    email,
    tracking: null,
    /**
     * What happened to the money.
     *
     * Separate from `status`, which is about the parcel. An order can be paid
     * and unshipped, shipped and refunded, or placed and never captured, and
     * collapsing the two into one field is how a refund ends up looking like a
     * delivery.
     */
    payment: {
      provider: storefront.checkout?.provider || 'demo',
      status: 'captured',
      reference: null,
      method: null,
      amount: cart.total,
      capturedAt: nowIso(),
      ...payment,
    },
    refunds: [],
    refundedTotal: { amount: 0, currency: CURRENCY },
  }

  // Decrement what was sold. A checkout that leaves inventory alone lets the
  // same last unit be bought indefinitely, which hides every stock bug there is.
  for (const line of cart.lines) {
    if (!line._untracked) db.adjustInventory(line.variantId, -line.quantity)
    for (const vid of line._components || []) db.adjustInventory(vid, -line.quantity)
  }
  adopt()

  write(KEY.orders, [order, ...orders])
  return order
}

export async function checkout({ email, shippingAddress, shippingMethod = 'standard' }) {
  await latency()
  const order = placeOrderFromCart(priceCart(loadCart()), { email, shippingAddress, shippingMethod })

  // Only a browser checkout does these two: the placing browser earns the right
  // to reopen its own confirmation page, and the bag it just bought is emptied.
  write(KEY.placed, [order.id, ...read(KEY.placed, [])].slice(0, 50))
  saveCart(emptyCart())
  return withDownloads(order)
}

/* ── on-site payments (checkout.mode "payments") ───────────────────────── */

/**
 * The two kinds of method a real backend offers, so the payment step can be
 * previewed without one: a test card taken on the page, and cash on delivery,
 * which needs nothing from the shopper.
 */
const PAYMENT_METHODS = [
  {
    id: 'demo-card', providerId: 'demo', methodId: 'card', provider: 'demo', providerName: 'Demo',
    code: 'card', name: 'Card', image: null, brands: [], flow: 'direct', test: true, canSave: false, note: null,
  },
  {
    id: 'custom-cod', providerId: 'custom', methodId: 'cod', provider: 'custom', providerName: 'Cash on Delivery',
    code: 'cash_on_delivery', name: 'Cash on delivery', image: null, brands: [], flow: 'offline', test: false,
    canSave: false, note: 'Pay the courier in cash or by UPI when your parcel arrives.',
  },
]

function paymentCart(cartId) {
  const cart = priceCart(loadCart())
  if (cartId && cart.id && cart.id !== cartId) {
    throw new ApiError('That bag has expired. Please review it and try again.', { status: 404, code: 'cart_not_found' })
  }
  if (!cart.lines.length) throw new ApiError('Your bag is empty.', { status: 422, code: 'empty_cart' })
  return cart
}

const loadPayments = () => read(KEY.payments, {})

function savePayment(payment) {
  const all = { ...loadPayments(), [payment.id]: payment }
  // Keep the newest fifty; an abandoned attempt should not live in storage forever.
  const newest = Object.values(all).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 50)
  write(KEY.payments, Object.fromEntries(newest.map((p) => [p.id, p])))
}

function findPayment(paymentId) {
  const payment = loadPayments()[paymentId]
  if (!payment) throw new ApiError('We could not find that payment.', { status: 404, code: 'not_found' })
  return payment
}

/** What the API answers with — never the cart id or the stored request. */
const paymentView = ({ cartId: _cartId, request: _request, createdAt: _createdAt, ...payment }) => ({
  message: null, client: {}, redirect: null, order: null, ...payment,
})

/** The money is taken (or promised, for cash on delivery): place the order exactly as checkout does. */
function settlePayment(payment, status, message = null) {
  const { email, shippingAddress, shippingMethod, methodName } = payment.request
  const order = placeOrderFromCart(priceCart(loadCart()), {
    email,
    shippingAddress,
    shippingMethod,
    payment: {
      provider: payment.provider,
      status: status === 'paid' ? 'captured' : 'pending',
      reference: payment.reference,
      method: methodName,
      capturedAt: status === 'paid' ? nowIso() : null,
    },
  })
  write(KEY.placed, [order.id, ...read(KEY.placed, [])].slice(0, 50))
  saveCart(emptyCart())
  Object.assign(payment, { status, message, order: { id: order.id, number: order.number } })
}

export async function getPaymentOptions(cartId, { email } = {}) {
  await latency()
  const cart = paymentCart(cartId)
  if (!email) throw new ApiError('Please enter your email address.', { status: 422, code: 'email_required' })
  checkStock(cart)
  return { amount: cart.total, methods: PAYMENT_METHODS, savedMethods: [], total: PAYMENT_METHODS.length }
}

export async function createPayment(cartId, body = {}) {
  await latency()
  const cart = paymentCart(cartId)
  const method = PAYMENT_METHODS.find(
    (m) => m.providerId === String(body.providerId) && m.methodId === String(body.methodId),
  )
  if (!method) {
    throw new ApiError('That payment method is not available for this order.', { status: 422, code: 'invalid_payment_method' })
  }
  if (!body.email) throw new ApiError('Please enter your email address.', { status: 422, code: 'email_required' })
  if (body.expectedTotal != null && body.expectedTotal !== cart.total.amount) {
    throw new ApiError('Your bag changed while you were paying. Please check the total and try again.', {
      status: 409,
      code: 'cart_changed',
    })
  }
  checkStock(cart)

  const reference = `LM-PAY-${Date.now().toString(36).toUpperCase()}`
  const payment = {
    id: `pay_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    reference,
    provider: method.provider,
    flow: method.flow,
    status: 'draft',
    message: null,
    client: method.flow === 'direct'
      ? {
        reference,
        amount: cart.total.amount,
        currency: cart.total.currency,
        prefill: { name: body.shippingAddress?.name || '', email: body.email, contact: body.shippingAddress?.phone || '' },
      }
      : {},
    redirect: null,
    order: null,
    cartId: cart.id,
    createdAt: nowIso(),
    request: {
      email: body.email,
      shippingAddress: body.shippingAddress,
      shippingMethod: body.shippingMethod || 'standard',
      methodName: method.name,
    },
  }
  if (cart.total.amount === 0) settlePayment(payment, 'paid')
  else if (method.flow === 'offline') settlePayment(payment, 'pending', method.note)
  savePayment(payment)
  return paymentView(payment)
}

export async function paymentAction(paymentId, action, body = {}) {
  await latency()
  const payment = findPayment(paymentId)
  if (payment.provider !== 'demo' || action !== 'simulate') {
    throw new ApiError(`"${action}" is not a step this payment takes.`, { status: 404, code: 'unsupported_action' })
  }
  // A replayed step changes nothing once the payment has an answer.
  if (payment.status !== 'draft') return paymentView(payment)

  switch (body.outcome) {
    case 'done':
      settlePayment(payment, 'paid')
      break
    case 'pending':
      settlePayment(payment, 'pending', 'Your payment is being confirmed.')
      break
    case 'cancel':
      Object.assign(payment, { status: 'cancelled', message: 'The payment was cancelled. Your bag is unchanged.' })
      break
    case 'error':
      Object.assign(payment, { status: 'failed', message: 'The card was declined. This is a test — try another outcome.' })
      break
    default:
      throw new ApiError('Choose what the test payment should do.', { status: 422, code: 'invalid_outcome' })
  }
  savePayment(payment)
  return paymentView(payment)
}

export async function getPayment(paymentId) {
  await latency()
  return paymentView(findPayment(paymentId))
}

/**
 * Order history belongs to whoever is signed in — and to nobody otherwise.
 *
 * This used to hand back every order in the browser regardless of session, so
 * signing out and reloading still showed the previous person's purchases,
 * addresses and totals. On a shared laptop that is a real disclosure, and it is
 * the kind a demo backend teaches an integrator to reproduce.
 */
export async function listOrders() {
  await latency()
  const me = read(KEY.customer, null)
  if (!me) throw new ApiError('Sign in to see your orders.', { status: 401, code: 'unauthenticated' })
  const items = read(KEY.orders, []).filter(
    (o) => o.email?.toLowerCase() === me.email?.toLowerCase(),
  )
  return { items, total: items.length }
}

/**
 * A single order opens for its owner, or for the browser that placed it.
 *
 * The second half is what makes guest checkout work: somebody who has just
 * ordered without an account has nothing but the id, and bouncing them off
 * their own confirmation page to a sign-in form is the worst possible moment to
 * ask for a password. Anyone else gets a 404 rather than a 403 — a "you are not
 * allowed to see this" confirms the order exists.
 */
export async function getOrder(orderId) {
  await latency()
  const order = read(KEY.orders, []).find((o) => o.id === orderId || o.number === orderId)
  if (!order) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })

  const me = read(KEY.customer, null)
  // The browser capability is for guests only. Once somebody is signed in, that
  // is an assertion of identity, and it has to be the one that decides — or the
  // second person to use a shared laptop can open the first person's order.
  const allowed = me
    ? order.email?.toLowerCase() === me.email?.toLowerCase()
    : read(KEY.placed, []).includes(order.id)
  if (!allowed) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })

  return withDownloads(order)
}

/**
 * The files a paid order unlocks. A real backend streams each one from
 * `GET /orders/:id/downloads/:documentId` to the order's owner; the demo's file
 * is static, so its link is the file itself.
 */
function withDownloads(order) {
  if (order?.payment?.status !== 'captured' || order.status === 'cancelled') return order
  const files = order.lines.map((l) => products.find((p) => p.slug === l.productSlug)?.download).filter(Boolean)
  if (!files.length) return order
  return { ...order, downloads: files.map((f, i) => ({ id: `${order.id}-${i + 1}`, name: f.name, url: f.url })) }
}

/**
 * Find an order without an account, from the number and the email on it.
 *
 * The gap this closes is not theoretical: a guest checks out, clears their
 * browser or opens their phone, and their order becomes unreachable — the
 * confirmation link only works from the browser that placed it. They then email
 * support, which is a cost, or assume the order failed, which is worse.
 *
 * Both fields must match, and that is the whole security model. An order number
 * alone is guessable — they are sequential in most shops, including this one —
 * so the email is what turns a lookup into a proof. A real backend must also
 * rate-limit this endpoint: matched pairs are cheap to test in bulk otherwise,
 * and a store's order volume is a thing competitors like to know.
 */
export async function lookupOrder({ number, email } = {}) {
  await latency()

  if (!number?.trim() || !email?.trim()) {
    throw new ApiError('Both the order number and the email address are needed.', {
      status: 422,
      code: 'missing_fields',
    })
  }

  const wanted = number.trim().toLowerCase()
  const order = read(KEY.orders, []).find(
    (o) =>
      (o.number?.toLowerCase() === wanted || o.id?.toLowerCase() === wanted) &&
      o.email?.toLowerCase() === email.trim().toLowerCase(),
  )

  // The same 404 whether the number is wrong, the email is wrong or both. A
  // distinct "that order exists but the email does not match" turns this into
  // an oracle for which order numbers are real.
  if (!order) {
    throw new ApiError('No order matches that number and email address.', {
      status: 404,
      code: 'not_found',
    })
  }

  // Remembering it means the confirmation page works from here on, which is
  // what somebody looking their order up actually wanted.
  write(KEY.placed, [...new Set([order.id, ...read(KEY.placed, [])])].slice(0, 50))
  return withDownloads(order)
}

const DEMO_CUSTOMER = {
  id: 'cus_demo',
  email: 'demo@loom.store',
  firstName: 'Sam',
  lastName: 'Rivera',
  phone: '+1 555 0134',
  addresses: [
    {
      id: 'addr_1',
      name: 'Sam Rivera',
      line1: '117 Mercer Street',
      line2: 'Apt 4B',
      city: 'New York',
      region: 'NY',
      postalCode: '10012',
      country: 'US',
      phone: '+1 555 0134',
      isDefault: true,
    },
  ],
}

/**
 * Two orders for the demo account, so its Orders tab shows something.
 *
 * Written on first sign-in rather than at seed time, because they belong to
 * whichever email is used and there is no account until somebody signs in. A
 * fulfilled order with tracking and a delivered one from last season is enough
 * to exercise every status the list renders.
 */
function seedDemoOrders(email) {
  const orders = read(KEY.orders, [])
  if (orders.some((o) => o.email?.toLowerCase() === email.toLowerCase())) return

  const pick = (slug, size, qty = 1) => {
    const p = products.find((x) => x.slug === slug)
    const v = p?.variants.find((x) => x.options.Size === size) || p?.variants[0]
    if (!p || !v) return null
    return {
      variantId: v.id,
      slug: p.slug,
      title: p.title,
      image: p.images[0]?.url,
      options: v.options,
      quantity: qty,
      price: v.price,
      lineTotal: { amount: v.price.amount * qty, currency: v.price.currency },
    }
  }

  const build = (n, daysAgo, status, tracking, lines) => {
    const subtotal = lines.reduce((a, l) => a + l.lineTotal.amount, 0)
    return {
      id: `order_demo_${n}`,
      number: `LM-${10000 + n}`,
      status,
      placedAt: new Date(Date.now() - daysAgo * 864e5).toISOString(),
      lines,
      subtotal: { amount: subtotal, currency: CURRENCY },
      discount: null,
      shipping: { amount: 0, currency: CURRENCY },
      tax: { amount: 0, currency: CURRENCY },
      total: { amount: subtotal, currency: CURRENCY },
      shippingAddress: DEMO_CUSTOMER.addresses[0],
      shippingMethod: 'standard',
      email,
      tracking,
    }
  }

  const seeded = [
    build(428, 6, 'fulfilled', 'LM8841204471', [pick('oxford-shirt-ecru', 'M'), pick('merino-beanie', 'One size')].filter(Boolean)),
    build(392, 74, 'delivered', 'LM8830119265', [pick('selvedge-denim-straight', '32')].filter(Boolean)),
  ].filter((o) => o.lines.length)

  if (seeded.length) write(KEY.orders, [...orders, ...seeded])
}

export async function login({ email, password }) {
  await latency()
  if (!email || !password) throw new ApiError('Email and password are required.', { status: 422, code: 'missing_credentials' })
  if (password.length < 6) throw new ApiError('That password is too short.', { status: 401, code: 'invalid_credentials' })
  const customer = { ...DEMO_CUSTOMER, email }
  write(KEY.session, { token: `demo_${Date.now().toString(36)}` })
  write(KEY.customer, customer)
  seedDemoOrders(email)
  return { token: read(KEY.session, {}).token, customer }
}

export async function register({ email, password, firstName = '', lastName = '' }) {
  await latency()
  if (!email || !password) throw new ApiError('Email and password are required.', { status: 422, code: 'missing_credentials' })
  const customer = { ...DEMO_CUSTOMER, id: id('cus'), email, firstName, lastName, addresses: [] }
  write(KEY.session, { token: `demo_${Date.now().toString(36)}` })
  write(KEY.customer, customer)
  return { token: read(KEY.session, {}).token, customer }
}

export async function logout() {
  await latency()
  write(KEY.session, null)
  write(KEY.customer, null)
  return { ok: true }
}

export async function getMe() {
  await latency()
  const customer = read(KEY.customer, null)
  if (!customer) throw new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })
  return customer
}

export async function updateMe(patch) {
  await latency()
  const customer = read(KEY.customer, null)
  if (!customer) throw new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })
  const next = { ...customer, ...patch }
  write(KEY.customer, next)
  return next
}

export async function getCountry(code) {
  await latency()
  // Loaded when asked: every state of every country is a lot to send to a shopper who never reaches checkout.
  const { COUNTRY_DETAILS } = await import('../../data/regions.js')
  const details = COUNTRY_DETAILS[String(code || '').toUpperCase()]
  if (!details) throw new ApiError('We could not find that country.', { status: 404, code: 'not_found' })
  return details
}

export async function saveAddress(address) {
  await latency()
  const customer = read(KEY.customer, null)
  if (!customer) throw new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })
  const addresses = customer.addresses.slice()
  const idx = addresses.findIndex((a) => a.id === address.id)
  const next = { ...address, id: address.id || id('addr') }
  if (idx >= 0) addresses[idx] = next
  else addresses.push(next)
  if (next.isDefault) addresses.forEach((a) => (a.isDefault = a.id === next.id))
  const updated = { ...customer, addresses }
  write(KEY.customer, updated)
  return updated
}

export async function deleteAddress(addressId) {
  await latency()
  const customer = read(KEY.customer, null)
  if (!customer) throw new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })
  const updated = { ...customer, addresses: customer.addresses.filter((a) => a.id !== addressId) }
  write(KEY.customer, updated)
  return updated
}

/* ── wishlist ──────────────────────────────────────────────────────────── */

export async function getWishlist() {
  await latency()
  const slugs = read(KEY.wishlist, [])
  return {
    items: products.filter((p) => slugs.includes(p.slug)).map((p) => publicProduct(p)),
    total: slugs.length,
  }
}

export async function addToWishlist(slug) {
  await latency()
  const slugs = read(KEY.wishlist, [])
  if (!slugs.includes(slug)) write(KEY.wishlist, [slug, ...slugs])
  return { ok: true, slugs: read(KEY.wishlist, []) }
}

export async function removeFromWishlist(slug) {
  await latency()
  write(KEY.wishlist, read(KEY.wishlist, []).filter((s) => s !== slug))
  return { ok: true, slugs: read(KEY.wishlist, []) }
}

/* ── misc ──────────────────────────────────────────────────────────────── */

/**
 * A concrete delivery date, not a range.
 *
 * "Arrives Thursday 12 September" is a commitment a shopper can plan around;
 * "2–4 working days" is arithmetic they have to do themselves, and doing it is
 * a moment to abandon. Working days only, skipping weekends.
 */
export async function getDeliveryEstimate({ method = 'standard', country = 'US' } = {}) {
  await latency()
  const days = method === 'express' ? 1 : 3
  const cutoffHour = 14
  const now = new Date()
  const shipsToday = now.getHours() < cutoffHour

  const arrive = new Date(now)
  arrive.setDate(arrive.getDate() + (shipsToday ? 0 : 1))
  let added = 0
  while (added < days) {
    arrive.setDate(arrive.getDate() + 1)
    if (arrive.getDay() !== 0 && arrive.getDay() !== 6) added += 1
  }

  return {
    method,
    country,
    arrivesAt: arrive.toISOString(),
    cutoff: shipsToday ? `${cutoffHour}:00 today` : `${cutoffHour}:00 tomorrow`,
    shipsToday,
    guaranteed: false,
  }
}

/* ── admin (write API) ─────────────────────────────────────────────────── */

/**
 * The suggested attribute vocabulary.
 *
 * Suggestions, not a schema. The admin combobox offers these and accepts
 * anything typed over them — a closed list produces a merchandiser who cannot
 * describe what they are selling, and no list at all produces "Fabric",
 * "fabric", "Material" and "Composition" as four different attributes.
 */
/**
 * The vocabulary this store can describe things with: ours, plus its own.
 *
 * Library entries are marked `custom` so an editor can show where a suggestion
 * came from, and they win on a key collision — a merchant who has redefined
 * "weight" for their catalogue means their version.
 */
export async function listAttributes() {
  await latency()
  const library = db.getLibrary()
  const byKey = new Map(attributes.map((a) => [a.key, a]))
  for (const a of library.attributes) byKey.set(a.key, { ...byKey.get(a.key), ...a, custom: true })
  const items = [...byKey.values()]

  return {
    items,
    groups: attributeGroups,
    icons: featureIcons,
    assurances: [...assuranceTemplates, ...library.assurances],
    features: library.features,
    total: items.length,
  }
}

/* ── reuse library ─────────────────────────────────────────────────────── */

export async function listSizeCharts() {
  await latency()
  return { items: sizeCharts, total: sizeCharts.length }
}

export async function subscribe(email) {
  await latency()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) {
    throw new ApiError('That does not look like an email address.', { status: 422, code: 'invalid_email' })
  }
  return { ok: true }
}


/* ── the back office, loaded when first used ───────────────────────────── */

/**
 * Every admin endpoint lives in mock-admin.js and arrives with its first call.
 *
 * A shopper browsing the demo never opens the admin panel, and these are the
 * largest part of this file — orders, refunds, notifications, the catalogue
 * editor's writes. Loading them with the shop spent the first download on code
 * almost nobody runs. They share this module's state through the exports above.
 */
const later = (name) => async (...args) => (await import('./mock-admin.js'))[name](...args)
export const adminPlaceOrder = later('adminPlaceOrder')
export const adminListOrders = later('adminListOrders')
export const adminRefundOrder = later('adminRefundOrder')
// Shopper calls the demo cannot need at first paint: its orders are paid or cash on delivery, and it saves no cards.
export const getOrderPaymentOptions = later('getOrderPaymentOptions')
export const createOrderPayment = later('createOrderPayment')
export const cancelCartPayment = later('cancelCartPayment')
export const getExpressOptions = later('getExpressOptions')
export const getShippingOptions = later('getShippingOptions')
export const checkServiceability = later('checkServiceability')
export const addCode = later('addCode')
export const removeCode = later('removeCode')
export const claimReward = later('claimReward')
export const getGiftCard = later('getGiftCard')
export const getLoyalty = later('getLoyalty')
export const saveForLater = later('saveForLater')
export const getDeliverySlots = later('getDeliverySlots')
export const getPickupLocations = later('getPickupLocations')
export const setPickupLocation = later('setPickupLocation')
export const listPaymentMethods = later('listPaymentMethods')
export const deletePaymentMethod = later('deletePaymentMethod')
export const adminSendTestNotification = later('adminSendTestNotification')
export const adminGetCredentials = later('adminGetCredentials')
export const adminSaveCredentials = later('adminSaveCredentials')
export const adminUpdateOrder = later('adminUpdateOrder')
export const adminGetOrder = later('adminGetOrder')
export const adminListProducts = later('adminListProducts')
export const adminSaveProduct = later('adminSaveProduct')
export const adminDeleteProduct = later('adminDeleteProduct')
export const adminSetInventory = later('adminSetInventory')
export const adminAdjustInventory = later('adminAdjustInventory')
export const adminSaveCategory = later('adminSaveCategory')
export const adminDeleteCategory = later('adminDeleteCategory')
export const adminListCategories = later('adminListCategories')
export const adminUpdateSettings = later('adminUpdateSettings')
export const adminImport = later('adminImport')
export const adminExport = later('adminExport')
export const adminListDiscounts = later('adminListDiscounts')
export const adminSaveDiscount = later('adminSaveDiscount')
export const adminDeleteDiscount = later('adminDeleteDiscount')
export const uploadMedia = later('uploadMedia')
export const listMedia = later('listMedia')
export const deleteMedia = later('deleteMedia')
export const listLibrary = later('listLibrary')
export const saveLibraryItem = later('saveLibraryItem')
export const deleteLibraryItem = later('deleteLibraryItem')
export const adminSaveSizeChart = later('adminSaveSizeChart')
export const adminGetProduct = later('adminGetProduct')
export const adminReset = later('adminReset')
