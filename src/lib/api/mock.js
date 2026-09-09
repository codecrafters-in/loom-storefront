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
import * as mediaStore from '../media.js'
import { config } from '../config.js'
import { ApiError } from './contracts.js'

/**
 * The catalogue is read from the demo database, not from a static import.
 *
 * That indirection is what lets the admin panel write. `latency()` doubles as
 * the point where this module picks up the current data — every endpoint awaits
 * it already, so there is no separate "load" step to forget.
 */
let products = []
let categories = []
let collections = []
let sizeCharts = []
let storefront = {}

function adopt() {
  products = db.getProducts()
  categories = db.getCategories()
  collections = db.getCollections()
  sizeCharts = db.getSizeCharts()
  storefront = db.getSettings()
}
db.subscribe(adopt)

const CURRENCY = config.store.currency
const KEY = {
  discounts: 'loom.discounts',
  cart: 'loom.cart',
  orders: 'loom.orders',
  session: 'loom.session',
  wishlist: 'loom.wishlist',
  customer: 'loom.customer',
}

async function latency() {
  await db.ready()
  adopt()
  if (config.mockLatency > 0) {
    await new Promise((r) => setTimeout(r, config.mockLatency + Math.random() * config.mockLatency))
  }
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback // private mode, quota, or a stale shape from an older build
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — the session simply will not persist */
  }
}

const money = (amount) => ({ amount, currency: CURRENCY })
const id = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`

/** Strip the fields that only exist to drive the image script. */
const publicProduct = (p) => {
  const { _imageQuery, _altQuery, sizeChartId, ...rest } = p
  // A product either references a shared chart by id or carries its own. The
  // reference is resolved here so the storefront always sees one shape.
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

  items.sort(SORTS[sort] || SORTS.featured)

  const total = items.length
  const start = (page - 1) * perPage

  const facetScope = category
    ? products.filter((p) => {
        const scope = new Set(descendants(category))
        return p.categories.some((c) => scope.has(c))
      })
    : products

  return {
    items: items.slice(start, start + perPage).map(publicProduct),
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
  }
}

export async function getProduct(slug) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p || p.published === false) {
    throw new ApiError(`No product with slug "${slug}".`, { status: 404, code: 'not_found' })
  }
  return publicProduct(p)
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

  return { items: ranked.slice(0, limit).map(publicProduct), total: ranked.length, strategy }
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

function listCategoriesSync({ tree = true } = {}) {
  const decorate = (c) => ({
    slug: c.slug,
    name: c.name,
    parent: c.parent ?? null,
    blurb: c.blurb,
    image: { url: `/images/categories/${c.slug}.jpg`, alt: c.name },
    count: countIn(c.slug),
  })

  if (!tree) return { items: categories.map(decorate), total: categories.length }

  const roots = categories.filter((c) => !c.parent)
  const items = roots.map((r) => ({
    ...decorate(r),
    children: categories.filter((c) => c.parent === r.slug).map(decorate),
  }))
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

export async function getReviews(slug, { page = 1, perPage = 5 } = {}) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p) throw new ApiError('Unknown product.', { status: 404, code: 'not_found' })
  const n = Math.min(p.rating.count, 12)
  const sizes = p.options.find((o) => o.name === 'Size')?.values || ['M']
  const items = Array.from({ length: n }, (_, i) => ({
    id: `rev_${slug}_${i}`,
    author: NAMES[(i * 3) % NAMES.length],
    rating: i % 7 === 0 ? 4 : i % 11 === 0 ? 3 : 5,
    title: '',
    body: BODIES[(i * 5) % BODIES.length],
    createdAt: new Date(2026, 7, 28 - i * 3).toISOString(),
    verified: i % 4 !== 0,
    // The fields that make a review useful on an apparel page rather than
    // decorative: what they bought, how tall they are, how it fitted.
    size: sizes[i % sizes.length],
    height: p.fit?.model ? HEIGHTS[i % HEIGHTS.length] : null,
    fit: FIT_WORDS[i % 9 === 0 ? 0 : i % 7 === 0 ? 2 : 1],
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

const discounts = () => read(KEY.discounts, SEED_DISCOUNTS)
const discountByCode = (code) =>
  discounts().find((d) => d.code === String(code || '').toUpperCase() && d.active !== false)

const shippingFlat = () => storefront.commerce?.shippingMethods?.[0]?.price ?? 1200

const emptyCart = () => ({
  id: id('cart'),
  lines: [],
  discountCode: null,
  currency: CURRENCY,
})

function priceCart(cart) {
  const subtotalAmount = cart.lines.reduce((a, l) => a + l.unitPrice.amount * l.quantity, 0)
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
    lines: cart.lines.map((l) => ({ ...l, lineTotal: money(l.unitPrice.amount * l.quantity) })),
    subtotal: money(subtotalAmount),
    discount: money(discountAmount),
    shipping: money(shippingAmount),
    tax: money(taxAmount),
    total: money(afterDiscount + shippingAmount + taxAmount),
    freeShippingThreshold: money(freeOver),
    freeShippingRemaining: money(Math.max(0, freeOver - afterDiscount)),
  }
}

function loadCart() {
  const stored = read(KEY.cart, null)
  return stored && Array.isArray(stored.lines) ? stored : emptyCart()
}
function saveCart(cart) {
  const { lines, id: cartId, discountCode, currency } = cart
  write(KEY.cart, { id: cartId, lines, discountCode, currency })
  return priceCart(cart)
}

export async function getCart() {
  await latency()
  return priceCart(loadCart())
}

export async function addToCart({ variantId, quantity = 1 }) {
  await latency()
  const cart = loadCart()
  const product = products.find((p) => p.variants.some((v) => v.id === variantId))
  const variant = product?.variants.find((v) => v.id === variantId)
  if (!variant) throw new ApiError('That variant does not exist.', { status: 404, code: 'variant_not_found' })
  if (!variant.available) throw new ApiError('That size is out of stock.', { status: 409, code: 'out_of_stock' })

  const existing = cart.lines.find((l) => l.variantId === variantId)
  const wanted = (existing?.quantity || 0) + quantity
  if (wanted > variant.inventory) {
    throw new ApiError(`Only ${variant.inventory} left in that size.`, { status: 409, code: 'insufficient_inventory' })
  }

  if (existing) existing.quantity = wanted
  else
    cart.lines.push({
      id: id('line'),
      variantId,
      productSlug: product.slug,
      title: product.title,
      options: variant.options,
      image: product.images[0],
      quantity,
      unitPrice: variant.price,
      lineTotal: money(variant.price.amount * quantity),
    })

  return saveCart(cart)
}

export async function updateCartLine(lineId, quantity) {
  await latency()
  const cart = loadCart()
  const line = cart.lines.find((l) => l.id === lineId)
  if (!line) throw new ApiError('That line is no longer in your bag.', { status: 404, code: 'line_not_found' })
  if (quantity <= 0) cart.lines = cart.lines.filter((l) => l.id !== lineId)
  else {
    const variant = products.flatMap((p) => p.variants).find((v) => v.id === line.variantId)
    if (variant && quantity > variant.inventory) {
      throw new ApiError(`Only ${variant.inventory} left in that size.`, { status: 409, code: 'insufficient_inventory' })
    }
    line.quantity = quantity
  }
  return saveCart(cart)
}

export async function removeCartLine(lineId) {
  await latency()
  const cart = loadCart()
  cart.lines = cart.lines.filter((l) => l.id !== lineId)
  return saveCart(cart)
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

export async function checkout({ email, shippingAddress, shippingMethod = 'standard' }) {
  await latency()
  const cart = priceCart(loadCart())
  if (!cart.lines.length) throw new ApiError('Your bag is empty.', { status: 422, code: 'empty_cart' })
  if (!email) throw new ApiError('An email address is required.', { status: 422, code: 'email_required' })

  const orders = read(KEY.orders, [])
  const order = {
    id: id('order'),
    number: `LM-${10000 + orders.length + 428}`,
    status: 'placed',
    placedAt: new Date().toISOString(),
    lines: cart.lines,
    subtotal: cart.subtotal,
    discount: cart.discount,
    shipping: cart.shipping,
    tax: cart.tax,
    total: cart.total,
    shippingAddress,
    shippingMethod,
    email,
    tracking: null,
  }
  // Decrement what was sold. A checkout that leaves inventory alone lets the
  // same last unit be bought indefinitely, which hides every stock bug there is.
  for (const line of cart.lines) db.adjustInventory(line.variantId, -line.quantity)
  adopt()

  write(KEY.orders, [order, ...orders])
  saveCart(emptyCart())
  return order
}

const ORDER_STATUSES = ['placed', 'paid', 'fulfilled', 'delivered', 'cancelled']

export async function adminUpdateOrder(orderId, patch) {
  await latency()
  const orders = read(KEY.orders, [])
  const i = orders.findIndex((o) => o.id === orderId || o.number === orderId)
  if (i < 0) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })
  if (patch.status && !ORDER_STATUSES.includes(patch.status)) {
    throw new ApiError(`"${patch.status}" is not a valid status.`, { status: 422, code: 'invalid_status' })
  }
  // Cancelling puts the stock back. An order that vanishes without returning
  // its units is how a catalogue slowly loses inventory nobody can account for.
  if (patch.status === 'cancelled' && orders[i].status !== 'cancelled') {
    for (const line of orders[i].lines) db.adjustInventory(line.variantId, line.quantity)
    adopt()
  }
  orders[i] = { ...orders[i], ...patch, updatedAt: new Date().toISOString() }
  write(KEY.orders, orders)
  return orders[i]
}

export async function listOrders() {
  await latency()
  const items = read(KEY.orders, [])
  return { items, total: items.length }
}

export async function getOrder(orderId) {
  await latency()
  const order = read(KEY.orders, []).find((o) => o.id === orderId || o.number === orderId)
  if (!order) throw new ApiError('Order not found.', { status: 404, code: 'not_found' })
  return order
}

/* ── account ───────────────────────────────────────────────────────────── */

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

export async function login({ email, password }) {
  await latency()
  if (!email || !password) throw new ApiError('Email and password are required.', { status: 422, code: 'missing_credentials' })
  if (password.length < 6) throw new ApiError('That password is too short.', { status: 401, code: 'invalid_credentials' })
  const customer = { ...DEMO_CUSTOMER, email }
  write(KEY.session, { token: `demo_${Date.now().toString(36)}` })
  write(KEY.customer, customer)
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
    items: products.filter((p) => slugs.includes(p.slug)).map(publicProduct),
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

export async function adminListProducts({ q = '', page = 1, perPage = 25 } = {}) {
  await latency()
  const needle = q.trim().toLowerCase()
  // Admin sees drafts. `listProducts` never does.
  const all = needle
    ? products.filter((p) => `${p.title} ${p.slug} ${p.tags.join(' ')}`.toLowerCase().includes(needle))
    : products
  const start = (page - 1) * perPage
  return { items: all.slice(start, start + perPage).map(publicProduct), total: all.length, page, perPage }
}

export async function adminSaveProduct(patch) {
  await latency()
  return publicProduct(db.upsertProduct(patch))
}

export async function adminDeleteProduct(idOrSlug) {
  await latency()
  return db.deleteProduct(idOrSlug)
}

export async function adminSetInventory(variantId, quantity) {
  await latency()
  const v = db.setInventory(variantId, quantity)
  if (!v) throw new ApiError('Unknown variant.', { status: 404, code: 'variant_not_found' })
  return v
}

export async function adminAdjustInventory(variantId, delta) {
  await latency()
  const v = db.adjustInventory(variantId, delta)
  if (!v) throw new ApiError('Unknown variant.', { status: 404, code: 'variant_not_found' })
  return v
}

export async function adminSaveCategory(patch) {
  await latency()
  return db.upsertCategory(patch)
}

export async function adminDeleteCategory(slug) {
  await latency()
  return db.deleteCategory(slug)
}

export async function adminUpdateSettings(patch) {
  await latency()
  return db.updateSettings(patch)
}

export async function adminImport(payload) {
  await latency()
  return db.importCatalog(payload)
}

export async function adminExport() {
  await latency()
  return db.exportCatalog()
}

export async function adminListDiscounts() {
  await latency()
  const items = discounts()
  return { items, total: items.length }
}

export async function adminSaveDiscount(discount) {
  await latency()
  const code = String(discount.code || '').trim().toUpperCase()
  if (!code) throw new ApiError('A code is required.', { status: 422, code: 'code_required' })
  const list = discounts().slice()
  const i = list.findIndex((d) => d.code === code)
  const next = { ...discount, code }
  if (i >= 0) list[i] = { ...list[i], ...next }
  else list.push(next)
  write(KEY.discounts, list)
  return next
}

export async function adminDeleteDiscount(code) {
  await latency()
  write(KEY.discounts, discounts().filter((d) => d.code !== code))
  return { ok: true }
}

/* ── media ─────────────────────────────────────────────────────────────── */

/**
 * Uploads go to a browser-local binary store, and the product keeps a
 * `media:<id>` reference. In api mode this posts to your endpoint instead and
 * the product keeps whatever URL comes back — see docs/ADMIN.md.
 */
export async function uploadMedia(file) {
  const record = await mediaStore.upload(file)
  return record
}

export async function listMedia() {
  const items = await mediaStore.list()
  return {
    items: items.map((m) => ({
      id: m.id,
      url: `media:${m.id}`,
      type: m.type,
      name: m.name,
      width: m.width,
      height: m.height,
      duration: m.duration ?? null,
      bytes: m.bytes,
      createdAt: m.createdAt,
    })),
    total: items.length,
  }
}

export async function deleteMedia(id) {
  return mediaStore.remove(id)
}

export async function listSizeCharts() {
  await latency()
  return { items: sizeCharts, total: sizeCharts.length }
}

export async function adminSaveSizeChart(chart) {
  await latency()
  return db.upsertSizeChart(chart)
}

export async function adminGetProduct(idOrSlug) {
  await latency()
  const p = products.find((x) => x.id === idOrSlug || x.slug === idOrSlug)
  if (!p) throw new ApiError('Product not found.', { status: 404, code: 'not_found' })
  // Admin sees the raw record, including the chart reference rather than the
  // resolved copy — you edit the link, not the snapshot.
  const { _imageQuery, _altQuery, ...rest } = p
  return rest
}

export async function adminReset() {
  await latency()
  await db.resetToSeed()
  adopt()
  return { ok: true }
}

export async function subscribe(email) {
  await latency()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) {
    throw new ApiError('That does not look like an email address.', { status: 422, code: 'invalid_email' })
  }
  return { ok: true }
}
