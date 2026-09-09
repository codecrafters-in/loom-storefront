# API contract

This theme talks to its data through one interface. Two adapters implement it:

| Adapter | File | Used when |
| --- | --- | --- |
| Mock | `src/lib/api/mock.js` | `VITE_DATA_SOURCE=mock` (default) |
| HTTP | `src/lib/api/http.js` | `VITE_DATA_SOURCE=api` |

`src/lib/api/index.js` picks one at boot and asserts that both expose the same
function names, so an endpoint added to one and forgotten in the other fails
immediately rather than at runtime on a page nobody tested.

**If your server answers the routes below with the shapes below, the storefront
works unchanged.** Nothing else needs editing.

---

## Conventions

**Money is an integer of the currency's smallest unit, plus a code.**

```json
{ "amount": 12800, "currency": "USD" }   // $128.00
```

Never a float and never a formatted string. `0.1 + 0.2` is not `0.3` in binary
floating point, and a cart that adds up in floats is eventually a cent out on a
real invoice. Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) use whole units;
`src/lib/money.js` knows the list.

**Errors** use the HTTP status, plus a JSON body the theme will surface verbatim:

```json
{ "message": "Only 2 left in that size.", "code": "insufficient_inventory" }
```

`message` is shown to the shopper, so write it for them. `code` is for you.

**Auth** is `Authorization: Bearer <token>`. The token comes from
`POST /auth/login` and is kept in `localStorage` under `loom.session`. Set
`VITE_API_TOKEN` instead if your catalogue needs a publishable key on every
request — but never put a secret key there, because Vite compiles `VITE_*`
variables into the JavaScript bundle.

**CORS.** The storefront is a static site on its own origin. Your API must send
`Access-Control-Allow-Origin` for it and allow `Authorization`, or every request
fails with an opaque network error.

**Pagination.** List endpoints take `page` (1-based) and `per_page`, and return:

```json
{ "items": [], "total": 128, "page": 1, "perPage": 12 }
```

Clamp `per_page` server-side — 48 is a sensible ceiling.

**The theme sends `page` and `per_page` only.** Above a few thousand products
you will want cursors as well — offset pagination makes the database count and
discard rows it will never send, and an insert between page loads shifts every
row after it. Returning `nextCursor` alongside `page` is harmless and forward-
compatible, but the shipped storefront does not yet consume it; the numbered
pager is offset-based. See [PERFORMANCE.md](PERFORMANCE.md#pagination).

**Validation.** Every response is checked at the boundary
(`src/lib/api/contracts.js`). A 200 with a missing `price` or an empty `variants`
array throws a `ContractError` naming the endpoint and the field, because a
wrong shape that passes silently surfaces three components later as a null
dereference and takes an afternoon to trace.

---

## Bootstrap

### `GET /bootstrap`

Everything the first screen needs, in one request: settings, the category tree,
collections, and the products for every home rail.

```json
{
  "storefront": { },
  "categories": [ /* Category tree */ ],
  "collections": { "items": [], "total": 3 },
  "rails": { "{\"sort\":\"newest\",\"category\":null,…}": [ /* Product[] */ ] },
  "generatedAt": "2026-09-09T10:14:00.000Z"
}
```

`rails` is keyed by a stable hash of each home section's `source`, computed by
the same function on both sides (`src/lib/api/railKey.js`). Two sections with
identical sources share one entry.

**Optional.** Without it the theme makes the individual calls instead — so it is
a pure performance win you can add at any point.

Worth doing, though: without it the home page is five sequential round trips
before anything is readable, and on a real backend each is its own connection,
auth check and query plan. It is also cacheable at the CDN, because it contains
nothing per-user:

```
Cache-Control: public, max-age=60, stale-while-revalidate=600
```

Details and the rest of the caching strategy: **[PERFORMANCE.md](PERFORMANCE.md)**.

---

## Storefront configuration

### `GET /storefront`

Returns the theme configuration document — identity, currency, navigation, the
home page, recommendations, checkout. Full field reference in
[CONFIGURATION.md](CONFIGURATION.md).

**This endpoint is optional.** If it 404s or errors, the theme falls back to its
bundled defaults and keeps working, so it is safe to add last. Everything it
returns is optional too; omitted keys keep their defaults.

```json
{
  "version": 1,
  "store": { "name": "LOOM", "tagline": "…", "logo": { "wordmark": "LOOM" } },
  "pricing": { "currency": "USD", "locale": "en-US", "currencies": [] },
  "commerce": { "freeShippingOver": 15000, "shippingMethods": [], "countries": [] },
  "features": { "wishlist": true, "reviews": true },
  "navigation": { "primary": [], "footer": [], "announcement": { "messages": [] } },
  "home": [{ "type": "hero", "title": "…" }],
  "recommendations": { "strategy": "automatic", "limit": 4 },
  "checkout": { "mode": "redirect", "createUrl": "…" },
  "promises": []
}
```

Cache it hard — it changes when a merchant saves settings, not per request.

---

## Catalogue

### `GET /products`

| Query | Type | Notes |
| --- | --- | --- |
| `category` | string | Category slug |
| `collection` | string | Collection slug |
| `q` | string | Free-text search |
| `sizes` | csv | `S,M,L` |
| `colors` | csv | Colour names as they appear in `options` |
| `tags` | csv | |
| `min_price`, `max_price` | int | Minor units |
| `in_stock` | `1` | Only products with a buyable variant |
| `sort` | enum | `featured` `newest` `price-asc` `price-desc` `rating` |
| `page`, `per_page` | int | |

```json
{
  "items": [ /* Product */ ],
  "total": 24,
  "page": 1,
  "perPage": 12,
  "facets": {
    "sizes": ["XS", "S", "M", "L", "XL"],
    "colors": [{ "name": "Ecru", "hex": "#EDE6D8" }],
    "tags": ["cotton", "linen"],
    "priceRange": { "min": 4800, "max": 68500 }
  }
}
```

> **Facets must be computed over the whole category, not over the filtered
> result set.** If you narrow them to what is currently showing, selecting one
> colour removes every other colour from the panel and the shopper can never
> widen their own search. This is the single most common catalogue bug.

### `GET /products/:slug` → `Product`

```json
{
  "id": "prod_1",
  "slug": "merino-crew-knit",
  "title": "Fine Merino Crew",
  "subtitle": "19.5 micron extra-fine merino",
  "description": "Long-form copy…",
  "details": ["19.5 micron extra-fine merino", "Fully fashioned, 12gg"],
  "care": ["Hand wash cool", "Dry flat"],
  "price": { "amount": 16800, "currency": "USD" },
  "compareAtPrice": null,
  "images": [
    { "id": "merino-crew-knit-1", "url": "https://cdn…/1.jpg", "alt": "Fine Merino Crew in Oat",
      "width": 900, "height": 1125, "color": "Oat" }
  ],
  "options": [
    { "name": "Color", "values": ["Oat", "Charcoal"] },
    { "name": "Size", "values": ["XS", "S", "M", "L", "XL"] }
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
      "imageId": "merino-crew-knit-1"
    }
  ],
  "categories": ["knitwear", "knitwear-sweaters"],
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
    "id": "tops", "unit": "cm",
    "note": "Measured flat, garment not body.",
    "columns": ["Size", "Chest", "Length", "Shoulder", "Sleeve"],
    "rows": [["XS", 96, 68, 43, 61], ["S", 102, 70, 45, 62]]
  },
  "social": { "unitsAvailable": 57, "boughtLast30Days": 168, "savedCount": 27 },

  "enrichment": {
    "highlights": [
      { "key": "fabric", "value": "Merino wool" },
      { "key": "weight", "value": "260 gsm" }
    ],
    "features": [
      {
        "icon": "thermometer",
        "title": "19.5 micron, so it can go against skin",
        "body": "Anything above about 22 micron is the wool people remember itching."
      }
    ],
    "assurances": [
      {
        "icon": "refresh",
        "label": "30-day returns, no reason needed",
        "note": "Unworn, tags attached. A prepaid label is in every parcel."
      },
      { "icon": "ruler", "label": "Free size exchange, once per order" }
    ],
    "maker": {
      "name": "Todd & Duncan",
      "location": "Kinross, Scotland",
      "since": 2018,
      "rating": 4.9,
      "ratingCount": 204,
      "note": "Spinning on the shore of Loch Leven since 1867."
    },
    "specs": { "sleeve": "Full sleeve", "pattern": "Solid", "care": "Hand wash cool" },
    "manufacturer": {
      "genericName": "Apparel",
      "countryOfOrigin": "Italy",
      "manufacturer": "LOOM Studio, Ahmedabad 382405, India",
      "packer": "LOOM Studio, Ahmedabad 382405, India",
      "netQuantity": "1",
      "packOf": "1"
    }
  }
}
```

### Enrichment

Three blocks, deliberately not one:

Every block renders in the column beside the buy button. Nothing is a full-width
section below the fold any more: a page that asks a shopper to scroll past the
button to find the fabric weight has already lost the shoppers who would not
have scrolled, and they are the majority.

| Block | Where it renders | What it is for |
| --- | --- | --- |
| `highlights` | Above the buy button | The scan. Six pairs read in two seconds |
| `assurances` | Under the buy button | What happens after the sale — returns, exchange, repair, payment |
| `maker` | Under the assurances | Who made it. The marketplace seller block, adapted |
| `features` | "All details" → Features, a swipeable card row | Two or three things a competitor could not copy-paste |
| `specs` | "All details" → Specifications, one group per slide | The reference table. Nobody reads it end to end |
| `manufacturer` | "All details" → Manufacturer info | Compliance |

"All details" is a tab block, **open by default with the first tab rendered**.
Tabs rather than accordions on purpose: a tab shows something on arrival and an
accordion shows nothing, and enrichment that costs an interaction before it can
be read is mostly enrichment that does not get read.

The specification table is paged **by group**, not by row. The groups are already
the units a shopper thinks in, so a slide is a complete answer rather than an
arbitrary slice of a list — which is what makes a carousel acceptable here at
all. Order and grouping still come from `GET /attributes` on read; a backend
stores a flat map and no presentation order.
| `manufacturer` | Below the fold | Compliance, not marketing — see below |

Putting all of it in one long table means most shoppers read none of it and the
rest hunt for the two facts that would have decided the purchase. Putting all of
it above the fold pushes the buy button off the screen.

- **`highlights`** is an *ordered array*, not an object — order is editorial and
  a JSON object does not guarantee it. Only the first six render.
- **`specs`** is a flat `{ key: value }` map. Grouping happens on read, from the
  attribute vocabulary, so a backend never has to store presentation order.
- **`features[].icon`** is either a name from `GET /attributes` → `icons`, or a
  URL. Brands with their own iconography should not be forced into ours.
- **`manufacturer`** is a legal requirement in several markets. India's Legal
  Metrology rules mandate the manufacturer and packer address, the country of
  origin and the net quantity on an e-commerce listing. Treat it as compliance.

Every block is optional and renders nothing when absent, so a thin product is a
shorter page rather than a set of empty headings.

---

## Attributes

### `GET /attributes`

The suggested vocabulary behind `highlights` and `specs`.

```json
{
  "items": [
    { "key": "fabric", "label": "Fabric", "group": "general", "highlight": true,
      "values": ["Pure cotton", "Linen", "Merino wool"] },
    { "key": "weight", "label": "Weight", "group": "fabric", "unit": "gsm", "highlight": true }
  ],
  "groups": [{ "id": "general", "label": "General" }],
  "icons": ["sparkle", "shield", "leaf", "award"],
  "assurances": [
    { "icon": "refresh", "label": "30-day returns, no reason needed",
      "note": "Unworn, tags attached. A prepaid label is in every parcel." }
  ],
  "total": 31
}
```

`assurances` are starting points for `enrichment.assurances`, offered as one
click in the admin panel. Same reasoning as the attribute list: retyping a
returns policy from memory on the fortieth product is how a catalogue ends up
promising three different windows.

**Suggestions, not a schema.** The admin combobox offers these and accepts
anything typed over them. A closed list produces a merchandiser who cannot
describe what they are selling; no list at all produces `Fabric`, `fabric`,
`Material` and `Composition` as four separate attributes that can never be
filtered or compared.

| Field | Does |
| --- | --- |
| `key` | What is stored on the product |
| `label` | What a shopper sees |
| `group` | Which section of the specifications table it lands in |
| `unit` | Appended to the label in brackets |
| `highlight` | Offered first when editing highlights |
| `values` | Suggested values for that key |

Cache it hard. It changes when a merchant adds an attribute, not per request.

### The apparel blocks

`fit`, `fabric`, `sizeChart` and `social` are optional, and they are the
highest-value fields in the whole contract. Size and fit cause roughly two
thirds of fashion returns; apparel return rates run 20–40%, the highest of any
category. Reasoning and evidence: **[CRO.md](CRO.md)**.

| Field | Notes |
| --- | --- |
| `fit.verdict` | `true-to-size` · `runs-small` · `runs-large` · `null` |
| `fit.feedback` | Percentages summing to 100, **from purchasers**. Omit rather than invent |
| `fit.sample` | How many responses the feedback is based on |
| `fit.model` | `{ height (cm), size, label }`. Turns a photo into a scale reference |
| `fabric.composition` | `[[material, percent], …]` |
| `fabric.weight` | gsm. The field that decides drape and warmth |
| `fabric.certifications` | Third-party marks only — OEKO-TEX, GOTS, RWS, GRS, LWG |
| `sizeChartId` | Reference to a shared chart. `sizeChart` is the resolved copy the storefront reads |
| `sizeChart` | Garment measurements, laid flat. `columns` + `rows`, first column is the size |
| `published` | `false` hides it from every storefront read and 404s its URL |
| `images[].id` / `images[].color` | A colour-tagged image makes the gallery follow the picker |
| `variants[].imageId` | Fallback when no image carries the colour |
| `social` | Real counts only. Below a threshold the theme hides the block rather than showing a low number |

> Every one of these degrades cleanly. Omit `fit` and the block disappears; omit
> `sizeChart` and the picker links to the generic size guide instead. Nothing
> breaks, so you can add them incrementally.

Notes that matter in practice:

- **At least two images.** The grid swaps to the second one on hover; with one
  image the card still works but loses the interaction shoppers actually use.
- **`alt` is required.** An empty string is a bug, not a styling choice.
- **`variants` is the source of truth for stock**, not the product. The size
  picker greys out sizes with `inventory: 0` *in the selected colour*, which is
  only possible because inventory is per variant.
- **`swatches`** maps colour name to hex. Without it the colour picker has to
  guess what "Ecru" looks like.
- **`badges`** — `new` `sale` `bestseller` `low-stock` `sold-out`.

### `GET /products/:slug/related`

| Query | Notes |
| --- | --- |
| `limit` | Default 4 |
| `strategy` | Echoed from `recommendations.strategy` so you can honour it server-side |

```json
{ "items": [ /* Product */ ], "total": 12, "strategy": "automatic" }
```

Only called when `recommendations.strategy` is `api`; every other strategy is
resolved without a request. Return fewer than `limit` and the theme tops the
rail up from best-sellers rather than showing a short row.

### `GET /products/:slug/reviews?page=1&per_page=5`

```json
{
  "items": [
    {
      "id": "rev_1", "author": "Priya S.", "rating": 5,
      "body": "The measurements on the size chart were accurate.",
      "createdAt": "2026-08-28T00:00:00.000Z", "verified": true,
      "size": "M", "height": "5'9\"", "fit": "true",
      "photos": [{ "url": "…", "alt": "Customer photo" }]
    }
  ],
  "total": 302,
  "summary": {
    "average": 4.8,
    "count": 302,
    "breakdown": [{ "stars": 5, "count": 217 }, { "stars": 4, "count": 57 }],
    "fit": { "small": 6, "true": 88, "large": 6 },
    "withPhotos": 34
  }
}
```

`size`, `height`, `fit` (`"small"` · `"true"` · `"large"`) and `photos` are what
make a review useful on an apparel page rather than decorative. A five-star
"lovely" is decoration; "bought M, 5'11\", runs small" is a fitting room.

### `GET /categories`

Returns a **tree**. `?tree=0` returns the flat list, which is what an admin
panel wants.

```json
{
  "items": [
    {
      "slug": "shirts", "name": "Shirts", "parent": null,
      "blurb": "Poplin, oxford, and one very good linen.",
      "image": { "url": "…", "alt": "Shirts" },
      "count": 4,
      "children": [
        { "slug": "shirts-linen", "name": "Linen", "parent": "shirts",
          "image": { "url": "…", "alt": "Linen" }, "count": 1 }
      ]
    }
  ],
  "total": 6
}
```

Three rules the theme depends on:

- **`count` on a parent includes its descendants.** Otherwise the menu offers
  "Shirts (0)" while its children have stock.
- **Filtering by a parent must include descendants.** `GET /products?category=shirts`
  returns everything under Oxford, Linen and Flannel. Products only list their
  leaf category, so this resolution has to happen server-side.
- **Store flat, serve nested.** Keep `parent` on the row; build the tree on read.
  Nesting in storage makes every reparent a structural migration.
### `GET /collections` → `{ items: [{ slug, title, blurb, image, count }], total }`

---

## Cart

The cart lives on the server. Every mutation returns the **whole repriced cart**
and the theme replaces its state wholesale — it never recomputes a total
locally. Discounts, shipping thresholds and tax are server concerns, and a
client that recalculates them will eventually disagree with the invoice.

| Method | Route | Body |
| --- | --- | --- |
| `POST` | `/carts` | `{}` — creates one, returns `Cart` |
| `GET` | `/carts/:id` | 404 if expired; the theme silently creates a new one |
| `POST` | `/carts/:id/lines` | `{ variant_id, quantity }` |
| `PATCH` | `/carts/:id/lines/:lineId` | `{ quantity }` |
| `DELETE` | `/carts/:id/lines/:lineId` | |
| `DELETE` | `/carts/:id/lines` | Empties the cart |
| `POST` | `/carts/:id/discount` | `{ code }` — `""` clears it |

```json
{
  "id": "cart_a1b2",
  "currency": "USD",
  "lines": [
    {
      "id": "line_1",
      "variantId": "var_merino_oat_m",
      "productSlug": "merino-crew-knit",
      "title": "Fine Merino Crew",
      "options": { "Color": "Oat", "Size": "M" },
      "image": { "url": "…", "alt": "…" },
      "quantity": 2,
      "unitPrice": { "amount": 16800, "currency": "USD" },
      "lineTotal": { "amount": 33600, "currency": "USD" }
    }
  ],
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

`freeShippingRemaining` drives the progress bar in the cart and drawer. Return
zero when it does not apply.

Expected errors: `409 insufficient_inventory`, `409 out_of_stock`,
`422 invalid_discount`.

---

## Checkout

### `POST /carts/:id/checkout`

```json
{
  "email": "sam@example.com",
  "shipping_address": {
    "name": "Sam Rivera", "line1": "117 Mercer Street", "line2": "Apt 4B",
    "city": "New York", "region": "NY", "postalCode": "10012",
    "country": "US", "phone": "+1 555 0134"
  },
  "shipping_method": "standard"
}
```

→ `Order`.

> **The theme never collects card details, and it never should.** A storefront
> that touches a card number drags your whole frontend into PCI scope. In
> production, replace this call with your provider's flow — Stripe Elements,
> Razorpay Checkout, Adyen Drop-in — and create the order server-side when the
> payment webhook confirms. The address form here is exactly the part that is
> safe to own.

---

## Orders and account

| Method | Route | Returns |
| --- | --- | --- |
| `GET` | `/orders` | `{ items: Order[], total }` |
| `GET` | `/orders/:id` | `Order` |
| `POST` | `/auth/login` | `{ token, customer }` |
| `POST` | `/auth/register` | `{ token, customer }` |
| `POST` | `/auth/logout` | `{ ok: true }` |
| `GET` | `/me` | `Customer` — **401 when signed out is expected**, not an error |
| `PATCH` | `/me` | `Customer` |
| `POST` | `/me/addresses` | `Customer` |
| `PATCH` | `/me/addresses/:id` | `Customer` |
| `DELETE` | `/me/addresses/:id` | `Customer` |

Address endpoints return the **whole customer**, not the address, so the account
page never has to merge state by hand.

```json
{
  "id": "order_1", "number": "LM-10428", "status": "placed",
  "placedAt": "2026-09-09T10:14:00.000Z",
  "lines": [ /* CartLine */ ],
  "subtotal": {}, "discount": {}, "shipping": {}, "tax": {}, "total": {},
  "shippingAddress": { }, "email": "sam@example.com",
  "tracking": { "carrier": "DHL", "code": "JD014600…", "url": "https://…" }
}
```

`status` — `placed` `paid` `fulfilled` `delivered` `cancelled`.

---

## Wishlist

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/me/wishlist` | `{ items: Product[], total }` |
| `POST` | `/me/wishlist` | `{ product_slug }` |
| `DELETE` | `/me/wishlist/:slug` | |

The heart button updates optimistically and rolls back if the call fails, so
these can be slow without the grid feeling slow.

---

## Newsletter

`POST /newsletter` with `{ email }` → `{ ok: true }`. Return
`422 invalid_email` for a malformed address.

---

## Write API (admin)

Namespaced under `/admin`, authenticated, and **never reachable with a
storefront token**. Full guide, including the reference implementation at
`/admin` in this repo: **[ADMIN.md](ADMIN.md)**.

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/admin/products?q=&page=&per_page=` | `{ items, total, page, perPage }` |
| `POST` | `/admin/products` | Partial Product → Product |
| `PATCH` | `/admin/products/:id` | Partial Product → Product |
| `DELETE` | `/admin/products/:id` | |
| `PATCH` | `/admin/variants/:id/inventory` | `{ quantity }` — set |
| `POST` | `/admin/variants/:id/inventory` | `{ delta, reason?, operationId? }` — adjust |
| `POST` | `/admin/categories` | `{ slug, name, parent, blurb }` |
| `DELETE` | `/admin/categories/:slug` | Children are promoted to the deleted node's parent |
| `PATCH` | `/admin/storefront` | Deep-merged; arrays replace |
| `POST` | `/admin/import` | `{ mode, products, categories, collections, settings }` |
| `GET` | `/admin/export` | The same shape |

Two things that are easy to get wrong:

- **Prefer the inventory delta over the set.** Two people adjusting the same SKU
  with `set` silently overwrite each other; with a delta both land, and a
  replayed webhook keyed on `operationId` is a safe no-op.
- **A product price change must cascade to its variants** unless a variant has
  an explicit override — or you sell at last month's price.

`POST /admin/import` is what a nightly ERP dump should use. A thousand
individual writes is a thousand transactions, a thousand cache purges, and a
rate limit you will hit.

---

## Webhooks out

Push changes to the storefront so it can purge rather than wait for a TTL:

```
POST https://your-store.example/api/revalidate
{ "type": "product.updated", "slug": "merino-crew-knit", "at": "2026-09-09T…" }
```

`product.updated` · `product.deleted` · `inventory.updated` · `category.updated`
· `settings.updated` · `order.paid` · `order.fulfilled`.

Sign the payload and verify it — an unauthenticated revalidation endpoint is a
free cache-flush attack.

---

## Delivery estimate

### `GET /delivery-estimate?method=standard&country=US`

```json
{
  "method": "standard",
  "country": "US",
  "arrivesAt": "2026-09-14T00:00:00.000Z",
  "cutoff": "14:00 today",
  "shipsToday": true,
  "guaranteed": false
}
```

Optional. If it 404s the product page falls back to the shipping copy.

Worth implementing: a dated estimate — "Arrives Thursday 12 September" — is a
fact a shopper can plan around, where "2–4 working days" is arithmetic they have
to do themselves, and doing it is a moment to abandon. Count working days, and
respect a same-day cutoff.

---

## Wiring it up

1. `cp .env.example .env.local`
2. Set `VITE_DATA_SOURCE=api` and `VITE_API_BASE_URL=https://api.yourstore.com/v1`
3. `npm run dev`

Start with `GET /products` and `GET /products/:slug`. The home page, catalogue
and product page work off those two alone — cart, account and checkout can come
later, and the theme degrades to a visible error on those routes rather than a
blank screen.

If a response is the wrong shape you will get a `ContractError` in the console
naming the endpoint and the field. That message is the fastest debugging tool
in the project; read it before reaching for the network tab.
