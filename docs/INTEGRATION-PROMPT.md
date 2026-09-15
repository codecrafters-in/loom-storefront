# The integration prompt

Copy the block below into Claude, ChatGPT, Cursor or any coding agent, fill in
the four lines at the top, and it will build the backend that this storefront
talks to.

It is deliberately self-contained: every endpoint, every field, every trap. The
model does not need to read this repository to use it.

Works for Odoo, Shopify, Medusa, WooCommerce, Strapi, Django, Laravel, Rails,
Express, or a spreadsheet you are embarrassed about. The contract is the same;
only the adapter changes.

---

````markdown
You are building a backend for the LOOM storefront theme — an open-source React
storefront that talks to exactly one HTTP contract. My job is to give you the
contract; your job is to expose it from my system.

## Fill these in

- MY SYSTEM: <!-- Odoo 17 / Shopify / Medusa / WooCommerce / Django / … -->
- LANGUAGE: <!-- Python / JavaScript / PHP / Ruby / … -->
- BASE PATH: <!-- e.g. /api/storefront/v1 -->
- AUTH: <!-- none / bearer token / session cookie -->

## What you are building

An HTTP API. The storefront is a static site deployed separately (Vercel,
Netlify, S3). It calls your endpoints from the browser. You are NOT building a
frontend — it already exists.

Deliver, in this order:

1. The catalogue endpoints. The storefront's home page, category pages and
   product pages work off these alone.
2. Cart and checkout — and, if my payment gateways live in my system, the
   on-site payment routes.
3. Account, orders, wishlist.
4. `GET /bootstrap` and `GET /storefront` — performance and settings.
5. The `/admin/*` write endpoints, only if I want to manage the catalogue and
   fulfil orders (ship, track, deliver) from the storefront rather than from my
   own system.

Each stage is independently useful. Do not try to do all five before I can see
anything working.

## Non-negotiable rules

**1. Money is an integer of the currency's smallest unit, with a currency code.**

```json
{ "amount": 12800, "currency": "USD" }
```

That is $128.00. Never a float, never a formatted string, never "128.00".
`0.1 + 0.2` is not `0.3` in binary floating point, and a cart summed in floats
is eventually a cent out on a real invoice. Zero-decimal currencies (JPY, KRW,
VND, CLP, ISK) use whole units.

If my system stores prices as decimals, convert at the API boundary:
`round(price * 100)`. Do it once, in one function, and unit-test it.

**2. CORS.** The storefront is on a different origin. Every response needs
`Access-Control-Allow-Origin` for it, `Access-Control-Allow-Headers:
authorization, content-type`, and `OPTIONS` must be handled. Getting this wrong
produces an opaque "network error" in the browser with no useful detail — it is
the single most common cause of "nothing works".

**3. Never trust a price, total or quantity that came from the client.** The
cart is repriced server-side on every mutation and again at checkout.

**4. Pagination is `page` (1-based) and `per_page`.** List responses are always
`{ "items": [], "total": n, "page": 1, "perPage": 12 }`.

**5. Errors carry a shopper-readable message.**

```json
{ "message": "Only 2 left in that size.", "code": "insufficient_inventory" }
```

The `message` is displayed verbatim to the customer. Write it for them, not for
a log file. `code` is machine-readable. When a request fails on fields the
shopper can fix, name them — the forms mark exactly those fields:

```json
{ "message": "Please add the state / region.", "code": "invalid_address", "detail": { "fields": ["region"] } }
```

**6. The browser never decides that money moved.** Take every amount from the
order on the server. A gateway result sent by the browser counts only after you
verify its signature in constant time; otherwise wait for the gateway's webhook.
The payment id you give the browser is random, and you store only its hash.

**7. Anything that can be retried is idempotent.** Webhooks, payment actions,
fulfilment actions and inventory deltas are all delivered twice sooner or later.
A replay answers with the current state and has no second effect — no second
order, email, shipment or stock movement.

**8. An order moves only through the transitions the server allows, and the
server says which.** Placed → paid → shipped → delivered; cancel only before it
ships. The admin order carries `actions`, the list of what may happen next, and
every action re-checks it inside the write.

## Endpoints

### Catalogue

```
GET /products
  ?category=&collection=&q=&sizes=S,M&colors=Ecru&tags=linen
  &min_price=&max_price=&in_stock=1
  &sort=featured|newest|price-asc|price-desc|rating
  &page=1&per_page=12

→ { items: Product[], total, page, perPage, facets }

facets = {
  sizes: ["XS","S","M","L","XL"],
  colors: [{ name: "Ecru", hex: "#EDE6D8" }],
  tags: ["cotton","linen"],
  priceRange: { min: 4800, max: 68500 }
}
```

CRITICAL: compute facets over the **whole category**, not over the filtered
result set. If you narrow them to what is currently showing, selecting one
colour deletes every other colour from the filter panel and the shopper can
never widen their own search. This is the most common catalogue bug in
existence.

```
GET /products/:slug             → Product
GET /products/:slug/related     ?limit=4&strategy=automatic → { items, total }
GET /products/:slug/reviews     ?page=1&per_page=5 → { items, total, summary }
GET /categories                 ?tree=1 → { items: Category[], total }
GET /collections                → { items: Collection[], total }
```

### Product

```json
{
  "id": "prod_1",
  "slug": "merino-crew-knit",
  "title": "Fine Merino Crew",
  "subtitle": "19.5 micron extra-fine merino",
  "description": "Long-form copy.",
  "details": ["19.5 micron extra-fine merino", "Fully fashioned, 12gg"],
  "care": ["Hand wash cool", "Dry flat"],

  "price": { "amount": 16800, "currency": "USD" },
  "compareAtPrice": null,

  "images": [
    { "id": "merino-1", "url": "https://cdn/1.jpg", "alt": "Fine Merino Crew in Oat",
      "width": 900, "height": 1125, "color": "Oat" }
  ],

  "options": [
    { "name": "Color", "values": ["Oat", "Charcoal"] },
    { "name": "Size",  "values": ["XS", "S", "M", "L", "XL"] }
  ],
  "swatches": { "Oat": "#DCD3C3", "Charcoal": "#3A3A3C" },

  "variants": [
    {
      "id": "var_merino_oat_m",
      "sku": "MERINO-OAT-M",
      "options": { "Color": "Oat", "Size": "M" },
      "price": { "amount": 16800, "currency": "USD" },
      "compareAtPrice": null,
      "inventory": 6,
      "available": true,
      "imageId": "merino-1"
    }
  ],

  "categories": ["knitwear", "knitwear-cashmere"],
  "productTypeId": "12",
  "tags": ["merino", "layering"],
  "rating": { "average": 4.8, "count": 302 },
  "badges": ["bestseller"],
  "published": true,
  "createdAt": "2026-02-14T00:00:00.000Z",

  "fit": {
    "verdict": "true-to-size",
    "feedback": { "small": 6, "true": 88, "large": 6 },
    "sample": 302,
    "note": "Fully fashioned, so it holds its shape. Take your usual size.",
    "model": { "height": 175, "size": "S", "label": "5'9\"" }
  },
  "fabric": {
    "composition": [["Extra-fine merino wool", 100]],
    "weight": 260,
    "weave": "12gg fully fashioned",
    "origin": "Biella, Italy",
    "certifications": ["Responsible Wool Standard", "OEKO-TEX Standard 100"]
  },
  "sizeChartId": "tops",
  "sizeChart": {
    "id": "tops",
    "unit": "cm",
    "note": "Measured flat, garment not body.",
    "columns": ["Size", "Chest", "Length", "Shoulder", "Sleeve"],
    "rows": [["XS", 96, 68, 43, 61], ["S", 102, 70, 45, 62]]
  },
  "social": { "unitsAvailable": 57, "boughtLast30Days": 168, "savedCount": 27 },

  "enrichment": {
    "highlights": [{ "key": "fabric", "value": "Merino wool" }],
    "features": [{ "icon": "thermometer", "title": "…", "body": "…" }],
    "assurances": [
      { "icon": "refresh", "label": "30-day returns, no reason needed", "note": "…" }
    ],
    "maker": { "name": "Filatura Sesia", "location": "Biella, Italy" },
    "specs": { "sleeve": "Full sleeve", "care": "Hand wash cool" },
    "manufacturer": {
      "genericName": "Apparel", "countryOfOrigin": "Italy",
      "manufacturer": "…", "packer": "…", "netQuantity": "1", "packOf": "1"
    }
  }
}
```

Rules on Product:

- **At least two images.** The grid swaps to the second on hover.
- **`alt` is required.** An empty string is a bug.
- **`variants` is the source of truth for stock**, not the product. The size
  picker greys out sizes with `inventory: 0` *in the selected colour*, which is
  only possible per variant. A product with no stock returns its variants with
  `available: false` — never an empty array, or the page has nothing to sell.
- **The matrix may be sparse.** Four colours and four sizes does not mean
  sixteen variants; white might be made in S and M only. Do not generate the
  cartesian product and do not treat a missing combination as an error. The
  storefront distinguishes "sold out" from "not made in this colour", and they
  are different answers to what a shopper is asking.
- **`swatches`** maps colour name to hex, so the picker does not have to guess
  what "Ecru" looks like.
- **`badges`** — any of `new` `sale` `bestseller` `low-stock` `sold-out`.
- **`categories`** lists the leaf and its ancestors, or just the leaf if you
  resolve ancestors server-side when filtering.

`enrichment` is several blocks on purpose, and all of them render in the column
beside the buy button. `highlights` sits under the price (six pairs, the
two-second scan) and its **first three also render as chips over the main
photograph**, which is the only enrichment a visitor who never scrolls will see.
`features`, `specs` and `manufacturer` (which carries `maker`) follow
immediately in an "All details" tab block that is open by default and sits
*above* the colour picker, in the order `fabric → specs → features → details →
manufacturer`. `assurances` sits under the buy button. The secure
checkout and payment marks close the column *after* that block rather than
sitting under the button — they answer a question a shopper has once they have
decided, not while they are deciding. None of it is a full-width section below the
fold: anything that decides a purchase has to be reachable without scrolling the
button away. `specs` is paged by group in a carousel, which is how a full table
fits in a 30rem column.

- `highlights` is an **ordered array**, not an object — order is editorial and a
  JSON object does not guarantee it
- `specs` is a **flat map**; grouping and ordering come from `GET /attributes` on
  read, so you never store presentation order
- `features[].icon` is an icon name or a URL
- `manufacturer` is compliance, not marketing. India's Legal Metrology rules
  require the manufacturer and packer address, the country of origin and the net
  quantity on an e-commerce listing
- `assurances` is the services block — returns, exchange, repair, payment. It
  answers *what happens if this is wrong*, which for apparel is usually the last
  question before the button; the specification table answers *is this the right
  thing*, and the two are not interchangeable. **Omit the field** and the
  product inherits `storefront.trust.assurances`; **send an empty array** and it
  renders nothing, which is a different statement. Do not merge the two — a coat
  with a ten-year guarantee must not also advertise the store's two-year one
- `maker` names the mill and renders as the first two rows of `manufacturer`,
  not as a block of its own. Keep `maker.location` consistent with
  `fabric.origin` and with `countryOfOrigin` — they render within four rows of
  each other, and a mill in one country next to an origin in another is a
  contradiction a shopper only has to notice once
- **`countryOfOrigin` is mandated, so answer it.** Derive it from the fabric
  origin rather than shipping a constant; "see product specifications" on a
  legally required field is the disclosure equivalent of a shrug

You will also need the **reuse library** — `GET /admin/library`,
`POST /admin/library/:kind`, `DELETE /admin/library/:kind/:id` for `attributes`,
`features` and `assurances`. `GET /attributes` folds the attribute half into its
response marked `"custom": true`, and those win on a key collision.

**Promote unrecognised attribute keys on write.** When a product is saved, any
highlight or specification key your vocabulary does not know should become a
suggestion on the next product, with the value seen against it collected on the
key. Without it, a merchant listing a hundred shirts writes "Collar type",
"Collar" and "Neck" across three of them, and no facet can filter on any of it.

Also expose the vocabulary behind it:

```
GET /attributes
→ {
    items: [{ key, label, group, unit?, highlight?, values?[] }],
    groups: [{ id, label }],
    icons: ["sparkle", "leaf", …],
    total
  }
```

**Suggestions, not a schema.** The admin offers these and accepts anything typed
over them — a closed list produces a merchandiser who cannot describe what they
are selling, and no list at all produces "Fabric", "fabric", "Material" and
"Composition" as four separate attributes nobody can filter on.

**The product type decides which blocks exist.** Every product has a type —
in most systems its category (in Odoo, the internal product category) — sent as
`productTypeId` on the admin read and write, with `productType` resolved on the
admin read. The type says which enrichment blocks the product has and what they
are called: `blocks: { fit, sizeChart, composition, compliance, fitInReviews }`,
`labels: { composition, care, details, weightUnit }` ("Fabric" in gsm for
clothing, "Materials" in kg for furniture, "Ingredients" in g for coffee) and
`specKeys`, the specification keys the type defines. **Do not treat `fit`,
`sizeChart` and `fabric` as universal**: a table has no fit and no size chart,
and its composition is its materials. Serve a block only for a type that has it
and omit it everywhere else; the storefront hides what is absent.
`GET /admin/library` lists every type (`productTypes`, `defaultProductTypeId`)
and the option names and values the store already uses (`options`). A write
with an unknown type is `422 unknown_product_type`; a POST without one gets the
type most similar products use; changing a product's type drops the
specifications the new type does not define.

**Options are any names.** `options` are the product's own option names —
Color and Size, Weight and Grind, Finish, Storage — and `variants[].options`
maps each name to a value. `swatches` holds hex colours for a colour option only;
never invent swatches for a Grind.

For a type that is worn and sized, `fit`, `fabric` and `sizeChart` are the
highest-value fields in the catalogue: size and fit cause roughly two thirds of
fashion returns, and apparel return rates run 20–40%, the highest of any
category. If my system holds this data anywhere — a product attribute, a spec
sheet, a supplier field — surface it. If it does not, tell me, and suggest where
it could live. `social` is optional for every type.

`fit.feedback` percentages come from post-purchase surveys or review metadata,
not from the merchant's opinion of their own cut. If you have no source, omit
`feedback` rather than inventing it.

`social` counts must be real. Do not fabricate "17 people are viewing this" —
shoppers recognise it, and the moment they do, every other number on the page
becomes suspect.

### Category

```json
{
  "slug": "shirts", "name": "Shirts", "parent": null,
  "blurb": "Poplin, oxford, and one very good linen.",
  "image": { "url": "…", "alt": "Shirts" },
  "count": 4,
  "children": [{ "slug": "shirts-linen", "name": "Linen", "parent": "shirts", "count": 1, "image": {} }]
}
```

- Store flat with a `parent` column; build the tree on read. Nesting in storage
  makes every reparent a structural migration.
- **A parent's `count` includes descendants.** Otherwise the menu shows
  "Shirts (0)" while its children have stock.
- **Filtering by a parent must include descendants.** `?category=shirts` returns
  everything under Oxford, Linen and Flannel.

### Reviews

```json
{
  "items": [{
    "id": "rev_1", "author": "Priya S.", "rating": 5,
    "body": "The measurements on the size chart were accurate.",
    "createdAt": "2026-08-28T00:00:00.000Z", "verified": true,
    "size": "M", "height": "5'9\"", "fit": "true",
    "photos": [{ "url": "…", "alt": "Customer photo" }]
  }],
  "total": 302,
  "summary": {
    "average": 4.8, "count": 302,
    "breakdown": [{ "stars": 5, "count": 217 }],
    "fit": { "small": 6, "true": 88, "large": 6 },
    "withPhotos": 34
  }
}
```

`size`, `height`, `fit` and `photos` are what make reviews useful on an apparel
page rather than decorative. `fit` is one of `"small"`, `"true"`, `"large"`.

### Cart

The cart is server-owned. Every mutation returns the **whole repriced cart**;
the client replaces its state wholesale and never recomputes a total.

```
POST   /carts                       {} | { fresh: true } → Cart
GET    /carts/:id                   → Cart (404 is fine; client makes a new one)
POST   /carts/:id/lines             { variant_id, quantity } → Cart
PATCH  /carts/:id/lines/:lineId     { quantity } → Cart
DELETE /carts/:id/lines/:lineId     → Cart
DELETE /carts/:id/lines             → Cart (empty it)
POST   /carts/:id/discount          { code } → Cart   ("" clears)
```

One customer, one open bag per store. You MUST:

- **Honour `fresh`.** `POST /carts` with `{ "fresh": true }` creates a new empty
  bag and never reuses an open one. The client sends it right after a bag
  became an order. Without `fresh`, a signed-in customer gets their newest open
  bag back (a new device restores the bag); a guest always gets a new one.
- **Merge on claim.** When a customer token opens a guest bag on any cart route,
  fold that customer's other open bags on the store into it — an item in both
  keeps the higher quantity, never the sum; skip items no longer sellable — then
  retire the others so they answer `404 cart_not_found`.
- **Close a bag once it is an order.** A bag that became an order, or has a
  payment underway or taken, answers `404 cart_not_found` on every cart route.

Skipping any of these lets a customer own two bags, and after paying one the
other comes back as "your bag" with items that look already bought.

```json
{
  "id": "cart_a1b2", "currency": "USD",
  "lines": [{
    "id": "line_1", "variantId": "var_merino_oat_m", "productSlug": "merino-crew-knit",
    "title": "Fine Merino Crew", "options": { "Color": "Oat", "Size": "M" },
    "image": { "url": "…", "alt": "…" }, "quantity": 2,
    "unitPrice": { "amount": 16800, "currency": "USD" },
    "lineTotal": { "amount": 33600, "currency": "USD" }
  }],
  "subtotal": { "amount": 33600, "currency": "USD" },
  "discount": { "amount": 3360, "currency": "USD" },
  "shipping": { "amount": 0, "currency": "USD" },
  "tax": { "amount": 2419, "currency": "USD" },
  "total": { "amount": 32659, "currency": "USD" },
  "discountCode": { "code": "LOOM10", "label": "10% off" },
  "freeShippingThreshold": { "amount": 15000, "currency": "USD" },
  "freeShippingRemaining": { "amount": 0, "currency": "USD" }
}
```

`freeShippingRemaining` drives a progress bar. Return zero when it does not
apply.

Errors: `409 insufficient_inventory`, `409 out_of_stock`, `422 invalid_discount`.

### Checkout

```
POST <checkout.createUrl>
{
  "cart_id": "cart_a1b2",
  "email": "sam@example.com",
  "shipping_address": { "name","line1","line2","city","region","postalCode","country","phone" },
  "shipping_method": "standard",
  "currency": "USD",
  "success_url": "https://shop.example/order/{ORDER_ID}",
  "cancel_url": "https://shop.example/cart"
}
```

Respond one of two ways depending on my configured mode:

- **redirect** (recommended): `{ "url": "https://checkout.stripe.com/…" }`. The
  browser is sent there. **No card data ever enters the storefront**, which
  keeps the entire frontend out of PCI DSS scope. Use my payment provider's
  hosted session — Stripe Checkout Session, Razorpay Payment Link, Adyen HPP.
- **api**: return an `Order`. For invoicing, cash on delivery, wholesale terms.

Your endpoint MUST, before creating anything:

1. Reprice every line from your own data. Never trust a client total.
2. Re-check inventory — someone may have bought the last one since add-to-cart.
3. Re-validate the discount (expiry, usage limit, minimum spend).
4. Calculate tax properly for the destination.
5. Be idempotent. Webhooks are delivered more than once; key on the provider's
   event id.

**Mark an order paid from the payment webhook, never from the success
redirect.** A shopper can close the tab before redirecting, and anyone can visit
a success URL by hand.

### On-site payments — only if my payment gateways live in my system

When `checkout.mode` is `"payments"`, the storefront shows my system's own
payment methods on its checkout page and asks me to run them:

```
POST /carts/:id/payment-options     checkout body → { amount, methods, savedMethods, total }
POST /carts/:id/payments            checkout body + provider_id, method_id or token_id,
                                    save_method, success_url, cancel_url, expected_total → Payment
POST /payments/:id/actions/:action  a gateway step the browser cannot post to me directly → Payment
GET  /payments/:id                  → Payment   (private, no-store)
```

A method is `{ id, providerId, methodId, provider, providerName, code, name,
image, brands, flow, test, canSave, note }`. `flow` is what the page does with
it: `direct` (the gateway's own form or modal, on the page), `redirect` (the
gateway's hosted page), `offline` (cash on delivery, bank transfer). Saved
methods pay with `token`.

`Payment`:

```json
{
  "id": "opaque random id", "reference": "S00012-1", "provider": "razorpay", "flow": "direct",
  "status": "draft", "message": null,
  "client": { "razorpay_key_id": "rzp_live_…", "razorpay_order_id": "order_…", "amount": 12800, "currency": "INR" },
  "redirect": null,
  "order": null
}
```

`status`: `draft` `pending` `authorized` `paid` `cancelled` `failed`. `order`
(`{ id, number }`) appears once the order exists. `redirect` is `{ url }` for a
hosted page; when the gateway sends the shopper back to me, redirect them to
`<storefront>/checkout/return?payment=<id>`.

MUST:

1. Apply the checkout body exactly as the checkout endpoint would — address,
   delivery, stock, discount — before listing methods, because what can pay
   depends on the destination and the total.
2. Lock the order while creating a payment (`409 payment_in_progress`), refuse a
   paid one (`409 already_paid`), and refuse an `expected_total` that no longer
   matches (`409 cart_changed`). `422 no_payment_methods` when nothing can pay.
3. `client` holds only values the gateway designs to be public. Build it once, on
   create — rebuilding it on every status read opens a new order at the gateway.
4. Allow-list actions per provider (`404 unsupported_action` otherwise). For
   Razorpay, `complete` takes `razorpay_payment_id`, `razorpay_order_id` and
   `razorpay_signature`; verify the HMAC before the payment counts
   (`403 invalid_signature`).
5. Offline methods place the order as pending straight away.
6. `GET /payments/:id` confirms the order the first time it sees a final payment,
   exactly once, and answers `409 retry` if another request holds the lock.
7. Never roll back a recorded payment because confirming the order failed.
   Store what the gateway reported in its own step; if confirming, invoicing or
   sending email then fails, keep the payment, log the error, answer `paid` with
   `order: null` and a `message` ("Payment received. We are confirming your
   order…"), and retry the confirmation on the next status read and in a
   background job until it succeeds.

### Orders, account, wishlist

```
GET   /orders                 → { items: Order[], total }
GET   /orders/:id             → Order
POST  /auth/login             { email, password } → { token, customer }
POST  /auth/register          { email, password, firstName, lastName } → { token, customer }
POST  /auth/logout            → { ok: true }
GET   /me                     → Customer   (401 when signed out is EXPECTED)
PATCH /me                     → Customer
POST   /me/addresses          → Customer
PATCH  /me/addresses/:id      → Customer
DELETE /me/addresses/:id      → Customer
GET    /countries/:code       → { code, name, stateRequired, zipRequired, states: [{ code, name }] }
GET    /me/wishlist           → { items: Product[], total }
POST   /me/wishlist           { product_slug } → { ok: true }
DELETE /me/wishlist/:slug     → { ok: true }
POST   /newsletter            { email } → { ok: true }
GET    /delivery-estimate     ?method=standard&country=US
                              → { arrivesAt, cutoff, shipsToday, method, country }
```

Address endpoints return the **whole Customer**, not the address, so the client
never merges state by hand.

Validate addresses on the server — at checkout and in the address book — and
refuse with `422 invalid_address` naming the fields in `detail.fields`. Store the
state as its code when the country has states. `GET /countries/:code` is what the
storefront's State / region dropdown is built from, so a state picked from it
must always validate; a country with no states answers an empty list and the
form keeps a text box.

Auth: the token from login is sent as `Authorization: Bearer <token>` on later
requests. `GET /me` returning 401 is the normal signed-out state and must not
be logged as an error.

`Order`:

```json
{
  "id": "order_1", "number": "LM-10428", "status": "placed",
  "placedAt": "2026-09-09T10:14:00.000Z",
  "lines": [ /* same shape as CartLine */ ],
  "subtotal": {}, "discount": {}, "shipping": {}, "tax": {}, "total": {},
  "shippingAddress": {}, "email": "sam@example.com",
  "tracking": { "carrier": "DHL", "code": "JD0146…", "url": "https://…" },
  "payment": { "provider": "razorpay", "status": "captured", "method": "UPI", "amount": {}, "capturedAt": "ISO" }
}
```

`status`: `placed` `paid` `fulfilled` (shipped) `delivered` `cancelled`.
`payment` is null until there is one; its `status` is `pending` `authorized`
`captured` `cancelled` `failed` — `captured` is what `GET /payments/:id` calls
`paid`.

### Performance: one request for the first screen

```
GET /bootstrap
→ {
    storefront: {…},            // the settings document below
    categories: [ Category ],   // the tree
    collections: { items, total },
    rails: { "<sourceKey>": [ Product ] },   // products for each home rail
    generatedAt: "ISO"
  }
```

Optional, and the highest-value optional thing here. Without it the home page is
five sequential round trips before anything is readable; with it, one. It
contains nothing per-user, so cache it at the CDN:

```
Cache-Control: public, max-age=60, stale-while-revalidate=600
```

`rails` is keyed by a JSON string of the rail's source with fields in this exact
order — `{"sort":…,"category":…,"collection":…,"tags":…,"limit":…}` — because the
client looks entries up by the same key.

Also apply, on every response:

- `Cache-Control: public, max-age=60, stale-while-revalidate=600` on catalogue reads
- `Cache-Control: private, no-store` on cart, `/me` and orders — a cached bag is
  how a shopper ends up looking at someone else's
- Clamp `per_page` server-side. 48 is a sensible ceiling
- Above a few thousand products, also return `nextCursor` and accept `?cursor=`

### Storefront configuration

```
GET /storefront → the theme settings document
```

Optional — if it 404s the theme uses its bundled defaults. It controls store
name, logo, currency, navigation, the entire home page (as an ordered list of
typed sections), recommendation strategy, checkout mode and feature flags.

If I want merchant-editable settings, ask me and I will paste the schema.

### Write API — only if I ask for it

If I want to manage the catalogue from the storefront rather than from my own
system, expose these under `/admin`, authenticated, and **never reachable with a
storefront token**:

```
GET    {origin}/loom/admin/authorize?store=&redirect_uri=&state=&code_challenge=&code_challenge_method=S256
                                                         → your own login page, then 302 to redirect_uri?code=&state=
POST   /admin/auth/token  { grant_type: "authorization_code", code, code_verifier, redirect_uri }
                          { grant_type: "refresh_token", refresh_token }   → { token, expiresAt, refreshToken, refreshExpiresAt, user }
                                                         (refresh tokens rotate; a reused one revokes the session)
POST   /admin/auth/logout { refresh_token }               (Authorization: Bearer)
POST   /admin/auth/login  { login, apiKey }               → { token }   (scripts only; passwords refused)
GET    /admin/products?q=&page=&per_page=                → { items, total, page, perPage }
GET    /admin/products/:id                               → Product (raw, sizeChartId unresolved, productTypeId and productType)
GET    /admin/library                                    → { attributes, features, assurances, productTypes, defaultProductTypeId, options }
POST   /admin/products                                   → Product
PATCH  /admin/products/:id                               → Product
DELETE /admin/products/:id
PATCH  /admin/variants/:id/inventory  { quantity }                    → Variant
POST   /admin/variants/:id/inventory  { delta, reason?, operationId? } → Variant
GET    /admin/categories                                 → { items, total }   (the /categories tree, empty categories included)
POST   /admin/categories              { slug, name, parent, blurb }
DELETE /admin/categories/:slug
GET    /size-charts                                      → { items, total }   (public)
POST   /admin/size-charts             { id, unit, note, columns, rows }
GET    /admin/orders?q=&status=&payment=&delivery=&page=&per_page=  → { items, total, page, perPage, counts }
GET    /admin/orders/:id                                  → AdminOrder
PATCH  /admin/orders/:id              { action: ship|update_tracking|deliver|record_payment|cancel, tracking? }
GET    /admin/discounts                                  → { items, total }
POST   /admin/discounts               { code, label, kind, value, active }
DELETE /admin/discounts/:code
POST   /admin/media       multipart, field "file"  → { id, url, type, width, height, duration? }
GET    /admin/media                                 → { items, total }
DELETE /admin/media/:id
PATCH  /admin/storefront
POST   /admin/import   { mode: "merge"|"replace", products, categories, collections, sizeCharts, settings }
GET    /admin/export
```

Media is multipart, not JSON — a base64 body is a third larger and holds the
file in memory twice. Return `width` and `height`; the storefront puts them on
the element so a catalogue page does not reflow while shots decode. `type` is
`image` or `video`.

`discounts.kind` is `percent`, `fixed` (minor units) or `shipping`.
`AdminOrder` is the customer `Order` plus what the back office needs:

```json
{
  "backendId": "42", "backendUrl": "https://my-system/orders/42",
  "customer": { "name": "…", "email": "…", "phone": "…" },
  "orderState": "quotation | confirmed | cancelled",
  "paymentStatus": "paid | authorized | pending | failed | unpaid",
  "delivery": { "status": "none | to_ship | shipped | delivered | cancelled", "method": "Standard",
                "shippedAt": null, "deliveredAt": null, "carrier": "", "trackingCode": "", "trackingUrl": "",
                "references": ["OUT/00013"] },
  "actions": ["ship", "update_tracking", "deliver", "record_payment", "cancel"]
}
```

The list takes `q`, `status`, `payment` (`paid`, `authorized`, `pending`,
`failed`, `unpaid`, or `awaiting` = not cancelled and `pending` or `unpaid`),
`delivery`, `page` and `per_page`. It also returns `counts: { toShip, shipped,
delivered, awaitingPayment, cancelled }` over every order, not the filtered page
— they label the filter tabs. Each count MUST equal the `total` of its tab's
filter, computed with the same predicate: `toShip` = `delivery=to_ship`,
`awaitingPayment` = `payment=awaiting`, `shipped` = `delivery=shipped`,
`delivered` = `delivery=delivered`, `cancelled` = `status=cancelled`. A count
built from a different rule than its list shows a number over an empty tab. `PATCH` takes exactly one `{ action, tracking? }` and answers the updated
`AdminOrder`; `tracking` is `{ carrier?, code?, url? }`, the URL `http(s)://` only.

Rules on writes:

1. **Prefer the inventory delta over the set.** Two people adjusting the same
   SKU with `set` silently overwrite each other; with a delta both land, and a
   replayed webhook keyed on `operationId` is a safe no-op.
2. **A product price change must cascade to its variants** unless a variant has
   an explicit override — or the store sells at last month's price.
3. **Deleting a category promotes its children** to the deleted node's parent.
   A tree with unreachable nodes is worse than a flat list.
4. **Derive `badges` and `available` on write.** `sale` from compare-at,
   `sold-out` and `low-stock` from the variants, `available` from
   `inventory > 0`. Computing them once at import and never again is how a
   product sells out and keeps advertising itself as in stock.
5. **Cancelling an order returns its stock.** Post a compensating movement; do
   not mutate a counter.
6. **`published: false` hides a product everywhere** — list, search,
   recommendations — and makes its own URL 404. Admin still lists it.
7. **Normalise on write.** My first POST will send a title, a slug and a price
   and nothing else. Default `tags` `badges` `details` `care` `categories`
   `images` `variants` `options` to empty, `rating` to `{average:0,count:0}`,
   `published` to true. A missing `rating` that reaches a sort comparator takes
   down a whole listing rather than one card.
8. **`GET /admin/products/:id` returns what you store**, because the editor sends
   the whole record back on every save: prices before pricelists and tax, every
   tag, fit, fabric and the product's own size chart. Saving an unchanged record
   must change nothing; `fit: null` or `fabric: null` means "leave it alone".
9. **Forgive half-finished input.** Skip blank assurance, feature and composition
   rows instead of refusing the product; match spec keys by key or label,
   case-insensitively; accept common country names and codes.
10. **A product created here tracks stock.** Whatever my system's default, the
    editor's inventory numbers are the stock, not decoration.
11. **Fulfilment actions do the real thing.** `ship` completes the delivery in my
    system (the stock leaves once) and stores the tracking; `update_tracking`
    only after shipping; `deliver` ships first if needed; `record_payment` only
    for an offline payment still pending; `cancel` only before shipping, and it
    returns the stock. Refuse anything not in `actions` with
    `409 action_not_allowed`.

`POST /admin/import` is what a nightly dump from my system should use. A
thousand individual writes is a thousand transactions and a rate limit I will
hit. Chunk large catalogues and make each chunk idempotent.

### Webhooks out

When something changes in my system, POST to the storefront so it can purge
rather than wait for a cache to expire:

```
POST <storefront>/api/revalidate
{ "type": "product.updated", "slug": "…", "at": "ISO" }
```

`product.updated` `product.deleted` `inventory.updated` `category.updated`
`settings.updated` `order.paid` `order.fulfilled`. Sign the payload — an
unauthenticated revalidation endpoint is a free cache-flush attack.

## How to work

1. Start with `GET /products` and `GET /products/:slug`. Show me those working
   before writing anything else.
2. Tell me explicitly which fields my system cannot supply, and what you
   substituted. Do not invent data — especially not `fit.feedback`, `rating` or
   `social` counts. A missing field is fine; a fabricated one is a returned
   order or a lost customer.
3. Where my system's model does not fit (e.g. it has no variant concept, or
   prices are decimals, or categories are flat), say so and propose the mapping
   rather than silently guessing.
4. Write the CORS configuration explicitly. Do not assume a framework default.
5. Give me a `curl` for each endpoint as you finish it, so I can verify without
   the storefront.

Begin by asking me any question you need answered before you can map my data
model onto this contract. Then write the code.
````

---

## Notes for specific systems

Paste one of these under `MY SYSTEM` for a better first pass.

**Odoo** — this is the most common case. Models are `product.template` (product), `product.product` (variant),
`product.attribute` / `product.attribute.value` (options), `product.category`,
`sale.order` (cart and order), `res.partner` (customer and addresses).
`list_price` is a float — convert at the boundary. Expose via a controller in a
custom module rather than JSON-RPC: JSON-RPC is awkward to call from a browser
and hard to secure for public catalogue reads. `website_sale` already models
much of this if the site module is installed.

**Shopify** — most of the contract maps onto the Storefront GraphQL API. You are
writing a thin translation layer: Shopify money is `{ amount: "128.00",
currencyCode }` as a decimal string, so multiply. Variants and options map
directly. Carts map to Cart API. Do not proxy the Admin API from a browser.

**Medusa** — closest match of any platform. Money is already integer minor
units, variants and options map one to one, and the cart and order models line
up. Mostly renaming.

**WooCommerce** — the REST API covers products, variations, orders and coupons.
Prices are decimal strings. Variations are separate objects; you will need to
assemble `options` and `variants` yourself.

**Nothing yet** — ask for a schema. A single `products` table with a `variants`
table and a `carts`/`cart_lines` pair is enough to open a store.


## Payments, refunds and email

Four endpoints, and three rules that matter more than the endpoints.

```
POST /carts/:cartId/checkout      create the payment (redirect and razorpay modes)
POST /payments/verify             razorpay mode: verify the signature, place the order
POST /webhooks/<provider>         the truth, when the browser closed early
POST /admin/orders/:id/refunds    { amount?, reason?, restock? } → the Order
```

In `payments` mode the storefront uses the on-site payment routes above instead,
and every rule below applies to them too.

**Never charge an amount the browser sent you.** This is the vulnerability in
almost every hand-rolled checkout: the page posts `{ amount: 24900 }` and the
server bills it, so anyone with a console open buys a coat for a penny. Re-price
the cart server-side from your own catalogue. If you cannot, refuse — a checkout
that quietly trusts the client is worse than one that does not start.

**Verify signatures in constant time, over the raw bytes.** The provider's
success handler runs in the page, so anything it reports can be forged; the HMAC
check is the only thing that makes a payment real. Comparing hashes with `===`
leaks their contents one character at a time — use `crypto.timingSafeEqual`. And
compute a webhook signature over the exact request body, not a re-stringified
parse, or verification will pass for a payload that was tampered with.

**`POST /admin/orders` must be idempotent on `idempotency_key`** and return
`created: false` on a replay. Providers retry; without that flag every retry
sends another confirmation email and decrements the stock again. Pair it with
`GET /admin/orders/:id`, which is admin-scoped rather than owner-scoped and must
not redact `payment.reference` — the refund path reads it.

**Treat the webhook as the truth.** A shopper who pays and closes the tab before
the redirect has still paid; without a webhook the money is taken and no order
exists. Key order creation on the payment id, because providers retry.

**Re-check stock inside checkout** and fail `409 out_of_stock` naming the
shortfall per line (`wanted`, `available`). Availability was last checked when
the line was added. Do not empty the bag on failure.

**Refunds are a list on the order**, with `refundedTotal`; `payment.status` stays
separate from `status`. Only a full refund restocks — guessing which line a
partial refund refers to puts the wrong variant back, and a phantom unit in
stock sells.

**Send email but never await it in the payment path.** A failing mail server
must not fail a payment that already succeeded.

**No endpoint may return a secret.** `GET /admin/credentials` returns
`(key, is_set, updated_at)`. The storefront config is served to every visitor,
so a `key_secret` in it is not a weak setting — it is the whole secret
published.

`examples/server` in this repo implements all of the above in about 450 lines
against Razorpay and Gmail, if you want something to read or deploy.
