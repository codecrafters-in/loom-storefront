/**
 * The contract between this theme and whatever is behind it.
 *
 * Both adapters — the bundled mock and the HTTP client — return these exact
 * shapes, so every component can be written once and never learn which one it
 * is talking to. If you are wiring a real backend, this file plus docs/API.md
 * is the whole specification.
 *
 * The validators are not belt-and-braces. A real integration fails in one of
 * two ways: the endpoint 500s, which is obvious, or it returns 200 with a
 * subtly wrong shape, which surfaces three screens later as "undefined is not
 * an object". Checking at the boundary turns the second kind into the first.
 */

/**
 * @typedef  {object} Money
 * @property {number} amount    Integer minor units. 12800 = $128.00.
 * @property {string} currency  ISO 4217, e.g. "USD".
 *
 * @typedef  {object} Image
 * @property {string} [id]      Referenced by Variant.imageId.
 * @property {string} [color]   Shown when this colour is selected.
 * @property {string} url       Absolute, or root-relative for bundled assets.
 * @property {string} alt       Required. An empty string is a bug, not a choice.
 * @property {number} [width]
 * @property {number} [height]
 *
 * @typedef  {object} Variant
 * @property {string} id
 * @property {string} sku
 * @property {Record<string,string>} options   e.g. { Size: "M", Color: "Ecru" }
 * @property {Money}  price
 * @property {Money|null} compareAtPrice
 * @property {number} inventory
 * @property {boolean} available
 * @property {string|null} imageId    Which image to show when this variant is picked.
 * @property {Record<string,string>} [optionIds]  { optionId: choiceId }. Phase 2; older backends omit it.
 *
 * @typedef  {object} Product
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {string} subtitle
 * @property {string} description
 * @property {string[]} details
 * @property {string[]} care
 * @property {Money}  price            The lowest variant price, for listings.
 * @property {Money|null} compareAtPrice
 * @property {Image[]} images
 * @property {{name:string, values:string[], id?:string, displayType?:string, role?:'color'|'size'|null,
 *   imagesFollow?:boolean, mode?:'variant'|'dynamic', choices?:object[]}[]} options
 * @property {'goods'|'service'|'digital'|'combo'} [type]
 * @property {object[]} [extraOptions]   No-variant attributes: engraving, gift box.
 * @property {{display:'exact'|'low'|'hidden', lowThreshold:number}} [stock]
 * @property {{min:number, max:number|null, step:number, unit:string, decimals:boolean}} [quantity]
 * @property {{slug:string, name:string, logo:Image|null}|null} [brand]
 * @property {{slug:string, name:string}[]} [breadcrumbs]
 * @property {object[]} [combo]          Groups, one item chosen from each.
 * @property {object[]} [optionalProducts]  ProductSummary[]
 * @property {object[]} [accessories]    ProductSummary[]
 * @property {object[]} [alternatives]   ProductSummary[]
 *
 * Every Phase 2 field is optional here on purpose: a backend that predates it
 * still validates, and the theme falls back to what it did before.
 * @property {Variant[]} variants
 * @property {string[]} categories     Category slugs.
 * @property {string[]} tags
 * @property {{average:number, count:number}} rating
 * @property {string[]} badges         "new" | "sale" | "bestseller" | "low-stock" | "sold-out"
 * @property {boolean} published       Drafts are invisible to the storefront.
 * @property {string} createdAt        ISO 8601.
 * @property {Fit|null} fit
 * @property {Fabric|null} fabric
 * @property {string|null} sizeChartId Reference to a shared SizeChart.
 * @property {SizeChart|null} sizeChart Resolved from `sizeChartId` on read.
 * @property {Social|null} social
 *
 * @typedef  {object} Fit
 * @property {'true-to-size'|'runs-small'|'runs-large'|null} verdict
 * @property {{small:number, true:number, large:number}|null} feedback  Percentages, from purchasers.
 * @property {number} sample
 * @property {string} note
 * @property {{height:number, size:string, label:string}|null} model    Height in cm.
 *
 * @typedef  {object} Fabric
 * @property {[string, number][]} composition   [["Merino wool", 100]]
 * @property {number|null} weight               gsm.
 * @property {string} weave
 * @property {string} origin
 * @property {string[]} certifications          Third-party marks only.
 *
 * @typedef  {object} SizeChart
 * @property {string} id
 * @property {'cm'|'in'} unit
 * @property {string} note
 * @property {string[]} columns                 First column is the size label.
 * @property {(string|number)[][]} rows
 *
 * @typedef  {object} Social
 * @property {number} unitsAvailable
 * @property {number} boughtLast30Days
 * @property {number} savedCount
 *
 * @typedef  {object} Category
 * @property {string} slug
 * @property {string} name
 * @property {string|null} parent
 * @property {string} blurb
 * @property {Image} image
 * @property {number} count             Includes descendants.
 * @property {Category[]} [children]
 *
 * @typedef  {object} Collection
 * @property {string} slug
 * @property {string} title
 * @property {string} blurb
 * @property {Image} image
 * @property {number} count
 *
 * @typedef  {object} Review
 * @property {string} id
 * @property {string} author
 * @property {number} rating           1–5.
 * @property {string} title
 * @property {string} body
 * @property {string} createdAt
 * @property {boolean} verified
 * @property {string} [size]
 * @property {string} [height]
 * @property {'small'|'true'|'large'} [fit]
 * @property {Image[]} [photos]
 *
 * @typedef  {object} CartLine
 * @property {string} id
 * @property {string} variantId
 * @property {string} productSlug
 * @property {string} title
 * @property {Record<string,string>} options
 * @property {Image}  image
 * @property {number} quantity
 * @property {Money}  unitPrice
 * @property {Money}  lineTotal
 *
 * @typedef  {object} Cart
 * @property {string} id
 * @property {CartLine[]} lines
 * @property {Money} subtotal
 * @property {Money} discount
 * @property {Money} shipping
 * @property {Money} tax
 * @property {Money} total
 * @property {{code:string, label:string}|null} discountCode
 * @property {string} currency
 *
 * @typedef  {object} Address
 * @property {string} id
 * @property {string} name
 * @property {string} line1
 * @property {string} [line2]
 * @property {string} city
 * @property {string} [region]
 * @property {string} postalCode
 * @property {string} country          ISO 3166-1 alpha-2.
 * @property {string} [phone]
 * @property {boolean} [isDefault]
 *
 * @typedef  {object} Order
 * @property {string} id
 * @property {string} number           Human-facing, e.g. "LM-10428".
 * @property {string} status           placed|paid|fulfilled|delivered|cancelled
 * @property {string} placedAt
 * @property {CartLine[]} lines
 * @property {Money} subtotal
 * @property {Money} discount
 * @property {Money} shipping
 * @property {Money} tax
 * @property {Money} total
 * @property {Address} shippingAddress
 * @property {string} shippingMethod
 * @property {string} email
 * @property {{carrier:string, code:string, url:string}|null} tracking
 *
 * @typedef  {object} Customer
 * @property {string} id
 * @property {string} email
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} [phone]
 * @property {Address[]} addresses
 */

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'api_error', detail } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

/** Thrown when a 200 response does not match the contract above. */
export class ContractError extends ApiError {
  constructor(where, expected, got) {
    super(
      `${where} did not match the API contract — expected ${expected}, got ${describe(got)}. See docs/API.md.`,
      { code: 'contract_violation' },
    )
    this.name = 'ContractError'
  }
}

function describe(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return `array(${v.length})`
  if (typeof v === 'object') return `object{${Object.keys(v).slice(0, 6).join(',')}}`
  return typeof v
}

const isMoney = (m) =>
  !!m && Number.isFinite(m.amount) && Number.isInteger(m.amount) && typeof m.currency === 'string'

export function assertMoney(value, where) {
  if (!isMoney(value)) throw new ContractError(where, 'Money { amount:int, currency:string }', value)
  return value
}

export function assertProduct(p, where = 'product') {
  if (!p || typeof p !== 'object') throw new ContractError(where, 'a Product object', p)
  for (const key of ['id', 'slug', 'title']) {
    if (typeof p[key] !== 'string' || !p[key]) throw new ContractError(`${where}.${key}`, 'a non-empty string', p[key])
  }
  assertMoney(p.price, `${where}.price`)
  if (!Array.isArray(p.images) || !p.images.length) throw new ContractError(`${where}.images`, 'at least one Image', p.images)
  // No variants is valid only while every combination is made when bought and nobody has bought one yet.
  const madeWhenBought = (p.options || []).some((o) => o.mode === 'dynamic')
  if (!Array.isArray(p.variants) || (!p.variants.length && !madeWhenBought)) {
    throw new ContractError(`${where}.variants`, 'at least one Variant', p.variants)
  }
  return p
}

export function assertCart(c, where = 'cart') {
  if (!c || typeof c !== 'object') throw new ContractError(where, 'a Cart object', c)
  if (typeof c.id !== 'string') throw new ContractError(`${where}.id`, 'a string', c.id)
  if (!Array.isArray(c.lines)) throw new ContractError(`${where}.lines`, 'an array', c.lines)
  for (const k of ['subtotal', 'total']) assertMoney(c[k], `${where}.${k}`)
  return c
}

export function assertList(res, where) {
  if (!res || !Array.isArray(res.items)) throw new ContractError(where, '{ items: [] }', res)
  if (!Number.isFinite(res.total)) throw new ContractError(`${where}.total`, 'a number', res.total)
  return res
}
