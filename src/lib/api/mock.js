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
import { products, categories, collections } from '../../data/catalog.js'
import { config } from '../config.js'
import { ApiError } from './contracts.js'

const CURRENCY = config.store.currency
const KEY = {
  cart: 'loom.cart',
  orders: 'loom.orders',
  session: 'loom.session',
  wishlist: 'loom.wishlist',
  customer: 'loom.customer',
}

const latency = () =>
  new Promise((r) => setTimeout(r, config.mockLatency + Math.random() * config.mockLatency))

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
  const { _imageQuery, _altQuery, ...rest } = p
  return rest
}

/* ── catalogue ─────────────────────────────────────────────────────────── */

const SORTS = {
  featured: (a, b) => b.rating.count - a.rating.count,
  newest: (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
  'price-asc': (a, b) => a.price.amount - b.price.amount,
  'price-desc': (a, b) => b.price.amount - a.price.amount,
  rating: (a, b) => b.rating.average - a.rating.average,
}

export async function listProducts(query = {}) {
  await latency()
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

  let items = products.slice()

  if (category) items = items.filter((p) => p.categories.includes(category))
  if (collection) {
    const c = collections.find((x) => x.slug === collection)
    items = c ? items.filter((p) => c.productSlugs.includes(p.slug)) : []
  }
  if (q) {
    const needle = q.toLowerCase()
    items = items.filter((p) =>
      [p.title, p.subtitle, p.description, ...p.tags, ...p.categories].join(' ').toLowerCase().includes(needle),
    )
  }
  if (sizes.length) items = items.filter((p) => p.variants.some((v) => sizes.includes(v.options.Size) && v.available))
  if (colors.length) items = items.filter((p) => p.options.find((o) => o.name === 'Color')?.values.some((c) => colors.includes(c)))
  if (tags.length) items = items.filter((p) => tags.some((t) => p.tags.includes(t)))
  if (Number.isFinite(minPrice)) items = items.filter((p) => p.price.amount >= minPrice)
  if (Number.isFinite(maxPrice)) items = items.filter((p) => p.price.amount <= maxPrice)
  if (inStock) items = items.filter((p) => p.variants.some((v) => v.available))

  items.sort(SORTS[sort] || SORTS.featured)

  const total = items.length
  const start = (page - 1) * perPage

  return {
    items: items.slice(start, start + perPage).map(publicProduct),
    total,
    page,
    perPage,
    // Facets are computed from the *unfiltered* set so a filter panel never
    // hides the option you would need to widen your own search.
    facets: buildFacets(category ? products.filter((p) => p.categories.includes(category)) : products),
  }
}

function buildFacets(scope) {
  const sizes = new Set()
  const colors = new Map()
  const tags = new Set()
  let min = Infinity
  let max = 0
  for (const p of scope) {
    p.options.find((o) => o.name === 'Size')?.values.forEach((s) => sizes.add(s))
    p.options.find((o) => o.name === 'Color')?.values.forEach((c) => colors.set(c, p.swatches?.[c] || '#ccc'))
    p.tags.forEach((t) => tags.add(t))
    min = Math.min(min, p.price.amount)
    max = Math.max(max, p.price.amount)
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
  if (!p) throw new ApiError(`No product with slug "${slug}".`, { status: 404, code: 'not_found' })
  return publicProduct(p)
}

export async function getRelated(slug, limit = 4) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p) return { items: [], total: 0 }
  const scored = products
    .filter((x) => x.slug !== slug)
    .map((x) => ({
      x,
      score:
        (x.categories.some((c) => p.categories.includes(c)) ? 3 : 0) +
        x.tags.filter((t) => p.tags.includes(t)).length,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.x.rating.count - a.x.rating.count)
  return { items: scored.slice(0, limit).map((s) => publicProduct(s.x)), total: scored.length }
}

export async function listCategories() {
  await latency()
  return {
    items: categories.map((c) => ({
      ...c,
      image: { url: `/images/categories/${c.slug}.jpg`, alt: c.name },
      count: products.filter((p) => p.categories.includes(c.slug)).length,
    })),
    total: categories.length,
  }
}

export async function listCollections() {
  await latency()
  return {
    items: collections.map((c) => ({
      slug: c.slug,
      title: c.title,
      blurb: c.blurb,
      image: { url: `/images/collections/${c.slug}.jpg`, alt: c.title },
      count: c.productSlugs.length,
    })),
    total: collections.length,
  }
}

/* ── reviews ───────────────────────────────────────────────────────────── */

const NAMES = ['Priya S.', 'Daniel R.', 'Mei L.', 'Tomás A.', 'Aisha K.', 'Jon W.', 'Elena V.', 'Rahul M.']
const BODIES = [
  'Exactly as described. The weight is the thing — it hangs properly instead of clinging.',
  'Second one of these. The first is two years old and still holds its shape.',
  'Runs true to size for me. I am usually between sizes and took the smaller.',
  'Fabric is genuinely lovely. Took one star off because delivery took a week longer than quoted.',
  'Sized up for a looser fit and it worked well. Would buy in another colour.',
  'Worth the money, which is not something I say often about a shirt.',
]

export async function getReviews(slug, { page = 1, perPage = 5 } = {}) {
  await latency()
  const p = products.find((x) => x.slug === slug)
  if (!p) throw new ApiError('Unknown product.', { status: 404, code: 'not_found' })
  const n = Math.min(p.rating.count, 12)
  const items = Array.from({ length: n }, (_, i) => ({
    id: `rev_${slug}_${i}`,
    author: NAMES[(i * 3) % NAMES.length],
    rating: i % 7 === 0 ? 4 : i % 11 === 0 ? 3 : 5,
    title: '',
    body: BODIES[(i * 5) % BODIES.length],
    createdAt: new Date(2026, 7, 28 - i * 3).toISOString(),
    verified: i % 4 !== 0,
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
    },
  }
}

/* ── cart ──────────────────────────────────────────────────────────────── */

const DISCOUNTS = {
  LOOM10: { label: '10% off', kind: 'percent', value: 10 },
  WELCOME15: { label: '15% off your first order', kind: 'percent', value: 15 },
  FREESHIP: { label: 'Free shipping', kind: 'shipping', value: 0 },
}

const SHIPPING_FLAT = 1200 // $12.00

const emptyCart = () => ({
  id: id('cart'),
  lines: [],
  discountCode: null,
  currency: CURRENCY,
})

function priceCart(cart) {
  const subtotalAmount = cart.lines.reduce((a, l) => a + l.unitPrice.amount * l.quantity, 0)
  const rule = cart.discountCode ? DISCOUNTS[cart.discountCode.code] : null

  const discountAmount = rule?.kind === 'percent' ? Math.round((subtotalAmount * rule.value) / 100) : 0
  const afterDiscount = subtotalAmount - discountAmount

  const freeOver = config.store.freeShippingOver * 100
  const shippingFree = rule?.kind === 'shipping' || afterDiscount >= freeOver || cart.lines.length === 0
  const shippingAmount = shippingFree ? 0 : SHIPPING_FLAT

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
  const rule = DISCOUNTS[key]
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
  write(KEY.orders, [order, ...orders])
  saveCart(emptyCart())
  return order
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

export async function subscribe(email) {
  await latency()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) {
    throw new ApiError('That does not look like an email address.', { status: 422, code: 'invalid_email' })
  }
  return { ok: true }
}
