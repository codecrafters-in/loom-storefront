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
2. Cart and checkout.
3. Account, orders, wishlist.
4. `GET /bootstrap` and `GET /storefront` — performance and settings.
5. The `/admin/*` write endpoints, only if I want to manage the catalogue from
   the storefront rather than from my own system.

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
a log file. `code` is machine-readable.

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
  "social": { "unitsAvailable": 57, "boughtLast30Days": 168, "savedCount": 27 }
}
```

Rules on Product:

- **At least two images.** The grid swaps to the second on hover.
- **`alt` is required.** An empty string is a bug.
- **`variants` is the source of truth for stock**, not the product. The size
  picker greys out sizes with `inventory: 0` *in the selected colour*, which is
  only possible per variant. A product with no stock returns its variants with
  `available: false` — never an empty array, or the page has nothing to sell.
- **`swatches`** maps colour name to hex, so the picker does not have to guess
  what "Ecru" looks like.
- **`badges`** — any of `new` `sale` `bestseller` `low-stock` `sold-out`.
- **`categories`** lists the leaf and its ancestors, or just the leaf if you
  resolve ancestors server-side when filtering.

The `fit`, `fabric`, `sizeChart` and `social` blocks are optional but they are
the highest-value fields in an apparel catalogue. Size and fit cause roughly two
thirds of fashion returns and apparel return rates run 20–40%, the highest of
any category. If my system holds this data anywhere — a product attribute, a
spec sheet, a supplier field — surface it. If it does not, tell me, and suggest
where it could live.

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
POST   /carts                       {} → Cart
GET    /carts/:id                   → Cart (404 is fine; client makes a new one)
POST   /carts/:id/lines             { variant_id, quantity } → Cart
PATCH  /carts/:id/lines/:lineId     { quantity } → Cart
DELETE /carts/:id/lines/:lineId     → Cart
DELETE /carts/:id/lines             → Cart (empty it)
POST   /carts/:id/discount          { code } → Cart   ("" clears)
```

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
GET    /me/wishlist           → { items: Product[], total }
POST   /me/wishlist           { product_slug } → { ok: true }
DELETE /me/wishlist/:slug     → { ok: true }
POST   /newsletter            { email } → { ok: true }
GET    /delivery-estimate     ?method=standard&country=US
                              → { arrivesAt, cutoff, shipsToday, method, country }
```

Address endpoints return the **whole Customer**, not the address, so the client
never merges state by hand.

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
  "tracking": { "carrier": "DHL", "code": "JD0146…", "url": "https://…" }
}
```

`status`: `placed` `paid` `fulfilled` `delivered` `cancelled`.

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
POST   /admin/auth/login  { username, password }         → { token }
GET    /admin/products?q=&page=&per_page=                → { items, total, page, perPage }
GET    /admin/products/:id                               → Product (raw, sizeChartId unresolved)
POST   /admin/products                                   → Product
PATCH  /admin/products/:id                               → Product
DELETE /admin/products/:id
PATCH  /admin/variants/:id/inventory  { quantity }                    → Variant
POST   /admin/variants/:id/inventory  { delta, reason?, operationId? } → Variant
POST   /admin/categories              { slug, name, parent, blurb }
DELETE /admin/categories/:slug
GET    /size-charts                                      → { items, total }   (public)
POST   /admin/size-charts             { id, unit, note, columns, rows }
PATCH  /admin/orders/:id              { status, tracking }
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
`orders.status` is `placed` `paid` `fulfilled` `delivered` `cancelled`.

Six rules on writes:

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
