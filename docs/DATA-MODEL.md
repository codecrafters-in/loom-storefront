# Data model

Every object the contract uses. Types are the JSDoc definitions in
`src/lib/api/contracts.js`, which is also where the runtime validation lives.

## Money

```ts
{ amount: number, currency: string }
```

`amount` is an **integer of the currency's smallest unit**. `12800` with
`"USD"` is $128.00.

Never a float. `0.1 + 0.2 !== 0.3` in binary floating point, and a cart summed
in floats is eventually a cent out on an invoice. This is also what every
payment provider expects — Stripe's `unit_amount`, Razorpay's `amount` — so the
value passes straight through with no conversion.

Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) use whole units. Handled in
`src/lib/money.js`.

## Image

```ts
{ id?: string, url: string, alt: string, width?: number, height?: number, color?: string }
```

`alt` is required. An empty string is a bug, not a styling choice. `width` and
`height` prevent layout shift and should be sent when known.

`color` tags a shot with an option value, so the gallery follows the colour
picker. `id` is what `Variant.imageId` references as the fallback.

## Product

```ts
{
  id, slug, title, subtitle, description: string
  details: string[]                 // construction notes
  care: string[]
  price: Money                      // lowest variant price, for listings
  compareAtPrice: Money | null
  images: Image[]                   // at least two — the grid swaps on hover
  options: { name: string, values: string[] }[]
  swatches: Record<string, string>  // colour name → hex
  variants: Variant[]               // source of truth for stock
  categories: string[]              // leaf and ancestors
  tags: string[]
  rating: { average: number, count: number }
  badges: ('new'|'sale'|'bestseller'|'low-stock'|'sold-out')[]
  published: boolean                // false hides it from every storefront read
  createdAt: string                 // ISO 8601

  fit?: Fit
  fabric?: Fabric
  sizeChartId?: string | null       // reference to a shared chart
  sizeChart?: SizeChart             // resolved from sizeChartId on read
  social?: Social
}
```

## Variant

```ts
{
  id, sku: string
  options: Record<string, string>   // { Color: "Oat", Size: "M" }
  price: Money
  compareAtPrice: Money | null
  inventory: number
  available: boolean                // always derived from inventory > 0
  imageId: string | null            // shown when this variant is selected
}
```

Stock lives here, not on the product. The size picker greys out sizes that are
out of stock **in the selected colour**, which is only expressible per variant.

A sold-out product returns its variants with `available: false` — never an empty
array, or the page has no picker and nothing to add.

**The matrix is allowed to be sparse.** Not every colour comes in every size, so
a product with four colours and four sizes may legitimately have fewer than
sixteen variants. The storefront renders three states per size in the selected
colour: available, sold out (struck through), and not made (dashed outline).
Collapsing the last two into one is a common mistake and it answers a shopper's
question wrongly — one is worth waiting for, the other is not.

## Fit

```ts
{
  verdict: 'true-to-size' | 'runs-small' | 'runs-large' | null
  feedback: { small: number, true: number, large: number } | null   // percentages
  sample: number
  note: string
  model: { height: number, size: string, label: string } | null     // height in cm
}
```

`feedback` comes from purchasers, not from the merchant. Omit it rather than
invent it — see [CRO.md](CRO.md).

## Fabric

```ts
{
  composition: [string, number][]   // [["Merino wool", 100]]
  weight: number | null             // gsm
  weave: string
  origin: string
  certifications: string[]          // third-party marks only
}
```

## SizeChart

```ts
{
  id: string
  unit: 'cm' | 'in'
  note: string
  columns: string[]                 // first column is the size label
  rows: (string | number)[][]
}
```

Garment measurements laid flat, not body measurements. A letter size does not
transfer between brands; a chest measurement does.

## Social

```ts
{ unitsAvailable: number, boughtLast30Days: number, savedCount: number }
```

Real counts. Below `trust.socialProofThresholds` the theme renders nothing —
see [CONFIGURATION.md](CONFIGURATION.md#trust).

## Cart and CartLine

```ts
CartLine {
  id, variantId, productSlug, title: string
  options: Record<string, string>
  image: Image
  quantity: number
  unitPrice: Money
  lineTotal: Money
}

Cart {
  id: string
  currency: string
  lines: CartLine[]
  subtotal, discount, shipping, tax, total: Money
  discountCode: { code: string, label: string } | null
  freeShippingThreshold?: Money
  freeShippingRemaining?: Money
}
```

The cart is server-owned. Every mutation returns the whole repriced cart.

## Order

```ts
{
  id, number, status: string        // placed|paid|fulfilled|delivered|cancelled
  placedAt: string
  lines: CartLine[]
  subtotal, discount, shipping, tax, total: Money
  shippingAddress: Address
  shippingMethod: string
  email: string
  tracking: { carrier, code, url } | null
}
```

## Address

```ts
{
  id, name, line1: string
  line2?: string
  city: string
  region?: string
  postalCode: string
  country: string                   // ISO 3166-1 alpha-2
  phone?: string
  isDefault?: boolean
}
```

## Customer

```ts
{ id, email, firstName, lastName: string, phone?: string, addresses: Address[] }
```

Address mutations return the whole Customer, so the client never merges by hand.

## Category

```ts
{
  slug, name: string
  parent: string | null
  blurb: string
  image: Image
  count: number                     // includes descendants
  children?: Category[]
}
```

## Review

```ts
{
  id, author: string
  rating: number                    // 1–5
  body: string
  createdAt: string
  verified: boolean
  title?: string
  size?: string
  height?: string
  fit?: 'small' | 'true' | 'large'
  photos?: Image[]
}
```

## Validation

Every type above has a JSDoc typedef in `src/lib/api/contracts.js`, which also
asserts the critical ones at the response boundary. A 200
with a missing `price` throws a `ContractError` naming the endpoint and the
field, rather than surfacing three components later as a null dereference. See
[ERRORS.md](ERRORS.md).
