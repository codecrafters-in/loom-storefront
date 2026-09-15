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
  enrichment?: Enrichment
  relatedSlugs?: string[]           // ordered; used only by the `manual` rail
}
```

**`images[].color` is what makes the gallery follow the picker.** An image tagged
with a colour shows only when that colour is selected; an untagged one — a fabric
crop, a packshot, the size guide — belongs to every colourway and always shows.
Point each variant's `imageId` at its own colour's first shot and the main image
changes with the swatch, with no code involved.

A store with one set of photographs simply tags nothing, and sees what it saw
before.

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

## Enrichment

```ts
{
  highlights: { key: string, value: string }[]     // ordered; first 6 render
  features: { icon: string, title: string, body: string }[]
  assurances?: { icon: string, label: string, note?: string }[]
  maker?: { name: string, location?: string }       // renders inside `manufacturer`
  specs: Record<string, string>                     // flat; grouped on read
  manufacturer?: {
    genericName?, countryOfOrigin?, manufacturer?,
    packer?, importer?, netQuantity?, packOf?: string
  }
}
```

`highlights` is an array because order is editorial and a JSON object does not
guarantee it. `specs` is a map because grouping and ordering are derived from the
attribute vocabulary on read — a backend never stores presentation order.

`features[].icon` is a name from `GET /attributes` → `icons`, or a URL.

`manufacturer` is compliance rather than marketing: India's Legal Metrology rules
require the manufacturer and packer address, the country of origin and the net
quantity on an e-commerce listing.

`assurances` is the services block under the buy button — returns, exchange,
repair, payment. It answers *what happens if this is wrong*, which for apparel is
usually the last question standing between a considered shopper and the button;
the specification table answers *is this the right thing*, and the two are not
interchangeable. `note` renders behind an (i) rather than in the row, because a
returns policy printed in full is four lines of prose next to a call to action.

**Omit it and the product inherits `storefront.trust.assurances`.** Most stores
have one returns policy. Sending an empty array is not the same thing — an empty
array means *this product has none*, and the block renders nothing.

`maker` names the mill, and renders as the first two rows of `manufacturer`
rather than as a block of its own. It started as a marketplace seller card —
name, rating, years — and that was the wrong shape twice over. On an own-brand
store the seller is never in doubt, so the card had nothing to reassure anyone
about; and a rating for a supplier nobody can review is a number somebody typed,
which makes the review count and the stock level look typed too.

What is left is the part that was actually information: who wove the cloth and
where. It sits with the compliance rows because that is where a shopper already
looks for manufacturing facts, and because the address on those rows is the
*brand's* — so the mill is new information rather than a second version of the
same one.

**Keep `maker.location` consistent with `fabric.origin`.** They render four rows
apart. A mill in one country beside a country of origin in another is the kind of
contradiction a shopper only has to notice once.

## Attribute

```ts
{
  key: string                       // stored on the product
  label: string                     // shown to a shopper
  group: string                     // which specifications section
  unit?: string                     // appended to the label in brackets
  highlight?: boolean               // offered first when editing highlights
  values?: string[]                 // suggested values
}
```

Suggestions, not a schema. See [API.md](API.md#attributes).

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
  requiresShipping?: boolean   // false: nothing ships, checkout asks for no address
}
```

The cart is server-owned. Every mutation returns the whole repriced cart.
A customer has at most one open cart per store: `POST /carts {"fresh": true}`
starts a new one after an order, and claiming a guest cart merges the customer's
other open cart into it — see [API.md › Who owns a bag](API.md#who-owns-a-bag).

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
  payment: {                        // null until the order has a payment
    provider, method: string
    status: string                  // pending|authorized|captured|cancelled|failed
    amount: Money
    capturedAt: string | null
  } | null
}
```

## PaymentMethod

One way to pay, from `POST /carts/:id/payment-options`, which answers
`{ amount: Money, methods: PaymentMethod[], savedMethods, total }`.

```ts
{
  id: string                        // "<providerId>-<methodId>"
  providerId, methodId: string
  provider: string                  // demo, razorpay, stripe, custom …
  providerName, code, name: string
  image: string | null
  brands: { name: string, image: string }[]
  flow: 'direct' | 'redirect' | 'offline'
  test: boolean                     // the provider is in test mode
  canSave: boolean
  note: string | null               // offline instructions, plain text
}
```

`savedMethods` entries are `{ id, providerId, provider, name, methodName }` and
pay with `flow: "token"`.

## Payment

From `POST /carts/:id/payments`, `POST /payments/:id/actions/:action` and
`GET /payments/:id`.

```ts
{
  id: string                        // opaque; the only thing the browser keeps
  reference: string                 // for people
  provider: string
  flow: 'direct' | 'redirect' | 'offline' | 'token'
  status: 'draft' | 'pending' | 'authorized' | 'paid' | 'cancelled' | 'failed'
  message: string | null
  client: Record<string, unknown> | null   // public gateway values; create response only
  redirect: { url: string } | null
  order: { id: string, number: string } | null
}
```

`paid` here is `captured` on `Order.payment` — the same payment in each route's
own vocabulary.

## AdminOrder

An `Order` plus what the back office needs, from `GET /admin/orders` (with
`counts`) and `GET` / `PATCH /admin/orders/:id`.

```ts
Order & {
  backendId: string | null
  backendUrl: string | null         // the order in the backend's own screens
  customer: { name, email, phone: string }
  orderState: 'quotation' | 'confirmed' | 'cancelled'
  paymentStatus: 'paid' | 'authorized' | 'pending' | 'failed' | 'unpaid'
  delivery: {
    status: 'none' | 'to_ship' | 'shipped' | 'delivered' | 'cancelled'
    method: string
    shippedAt: string | null
    deliveredAt: string | null
    carrier, trackingCode, trackingUrl: string
    references: string[]
  }
  actions: ('ship' | 'update_tracking' | 'deliver' | 'record_payment' | 'cancel')[]
}

// Each count is the `total` of its tab's filter, over every order:
// toShip = delivery=to_ship, awaitingPayment = payment=awaiting (pending or
// unpaid, not cancelled), shipped = delivery=shipped,
// delivered = delivery=delivered, cancelled = status=cancelled.
counts: { toShip, shipped, delivered, awaitingPayment, cancelled: number }
```

The `Order.status` it carries moves with fulfilment: `fulfilled` once shipped,
`delivered` once delivered. The demo adapter derives these fields in
`src/lib/admin-orders.js`; a real backend sends them. Actions and their effects:
[API.md](API.md).

## Address

```ts
{
  id, name, line1: string
  line2?: string
  city: string
  region?: string                   // the state code when the country lists states
  postalCode: string
  country: string                   // ISO 3166-1 alpha-2
  phone?: string
  isDefault?: boolean
}
```

## Country

What an address form needs for one country, from `GET /countries/:code`.

```ts
{
  code: string                      // ISO 3166-1 alpha-2
  name: string
  stateRequired: boolean
  zipRequired: boolean
  states: { code: string, name: string }[]   // empty: region is free text
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
