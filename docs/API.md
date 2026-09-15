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
real invoice. An amount is in the currency's smallest unit: cents for USD, fils for KWD (three decimals), whole yen
for JPY. The settings document says how many decimals each currency has (`pricing.currencies[].decimals`) and
`src/lib/money.js` divides by that; without it, it knows the zero-decimal (JPY, KRW, VND, CLP, ISK) and three-decimal
(BHD, IQD, JOD, KWD, LYD, OMR, TND) currencies.

**Currency and language** travel as headers on every call when the shopper chose them: `X-Loom-Pricelist: <id>` (the
currency switcher, one of `pricing.currencies[].pricelistId`) and `X-Loom-Lang: fr` (a language address such as
`/fr/shop`). Without them the backend answers in the store's default currency and language. Its cached answers vary on
both headers, and its error `message`s come in the requested language while `code`s never change.

**Errors** use the HTTP status, plus a JSON body the theme will surface verbatim:

```json
{ "message": "Only 2 left in that size.", "code": "insufficient_inventory" }
```

`message` is shown to the shopper, so write it for them. `code` is for you.

**Auth** is `Authorization: Bearer <token>` and nothing else — no cookies. The
customer token comes from `POST /auth/login` and is kept in `localStorage` under
`loom.session`; the admin token comes from Sign in with Odoo and is kept under
`loom.admin_session` ([ADMIN.md](ADMIN.md#authentication)). There is no
build-time token: a public catalogue needs none, and anything in a `VITE_*`
variable is compiled into the JavaScript bundle for anyone to read.

**CORS.** The storefront is a static site on its own origin. Your API must send
`Access-Control-Allow-Origin` for it and allow `Authorization`, or every request
fails with an opaque network error. The storefront never sends cookies, so do not
send `Access-Control-Allow-Credentials`.

**Server failures carry a reference.** A `500` answer may include `errorId`; the theme shows it under the error
("Reference: 3f2a9c0d1e4b") and sends it with its Sentry report, so the shopper, the storefront's report and the
backend's log all name the same failure.

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

**Caching.** Catalogue reads (`public` below) may be cached and revalidated — an
`ETag` with a short `max-age` is enough. Anything carrying a cart id, a payment
id or a token answers `Cache-Control: private, no-store`: a cached bag or payment
is how one shopper ends up looking at another's.

---

## Endpoint index

Every route the theme calls, and what the request must carry. **Auth** is
nothing, the cart or payment id in the path (an unguessable id is the
capability), a customer token, or an admin token — never interchangeable.

| Method | Route | Auth | Cache | Section |
| --- | --- | --- | --- | --- |
| `GET` | `/bootstrap` | none | public | [Bootstrap](#bootstrap) |
| `GET` | `/storefront` | none | public | [Storefront configuration](#storefront-configuration) |
| `GET` | `/products`, `/products/:slug` | none | public | [Catalogue](#catalogue) |
| `GET` | `/products/:slug/related`, `/products/:slug/reviews` | none | public | [Catalogue](#catalogue) |
| `GET` | `/categories`, `/collections` | none | public | [Catalogue](#catalogue) |
| `POST` | `/products/:slug/combination` | none | no-store (the theme caches it with the product) | [Combinations](#post-productsslugcombination) |
| `GET` | `/brands`, `/brands/:slug` | none | public | [Brands](#brands) |
| `GET` | `/search/suggest`, `/search/popular` | none | public / never | [Search](#search) |
| `POST` | `/search/log` | none; rate-limited | never | [Search](#search) |
| `GET` | `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind-:page.xml`, `/redirects` | none | public / never | [Search engines](#search-engines) (read by the render handler, not the browser) |
| `GET` | `/pages`, `/pages/:slug` | none | public | [Pages, contact, consent, access and blog](#pages-contact-consent-access-and-blog) |
| `POST` | `/contact`, `/consents` | none / customer | never | [Pages, contact, consent, access and blog](#pages-contact-consent-access-and-blog) |
| `POST` | `/access`, `/admin/access` | none / admin | never | [Pages, contact, consent, access and blog](#pages-contact-consent-access-and-blog) |
| `GET` | `/blog`, `/blog/:slug` | none | public | [Pages, contact, consent, access and blog](#pages-contact-consent-access-and-blog) |
| `GET` | `/attributes` | none | public | [Attributes](#attributes) |
| `GET` | `/size-charts` | none | public | [ADMIN.md](ADMIN.md) |
| `GET` | `/countries/:code` | none | public | [Orders and account](#orders-and-account) |
| `GET` | `/delivery-estimate` | none | public | [Delivery estimate](#delivery-estimate) |
| `POST` | `/carts` | none | no-store | [Cart](#cart) |
| `GET` `POST` `PATCH` `DELETE` | `/carts/:id`, `/carts/:id/lines…`, `/carts/:id/discount` | cart id | no-store | [Cart](#cart) |
| `POST` | `/carts/:id/attribution` | cart id | no-store | [Where the shopper came from](#where-the-shopper-came-from) |
| `POST` | `/carts/:id/checkout` | cart id | no-store | [Checkout](#checkout) |
| `POST` | `/carts/:id/payment-options`, `/carts/:id/payments` | cart id | no-store | [On-site payments](#on-site-payments) |
| `POST` | `/payments/:id/actions/:action` | payment id | no-store | [On-site payments](#on-site-payments) |
| `GET` | `/payments/:id` | payment id | no-store | [On-site payments](#on-site-payments) |
| `POST` | `/payments/verify` | none — the signature is the proof | no-store | [Payments, refunds and secrets](#payments-refunds-and-secrets) |
| `POST` | `/auth/login`, `/auth/register` | none; captcha when enabled | no-store | [Orders and account](#orders-and-account) |
| `POST` | `/auth/logout` | customer | no-store | [Orders and account](#orders-and-account) |
| `GET` `PATCH` | `/me` | customer | no-store | [Orders and account](#orders-and-account) |
| `POST` `PATCH` `DELETE` | `/me/addresses…` | customer | no-store | [Orders and account](#orders-and-account) |
| `GET` | `/orders` | customer | no-store | [Order visibility](#order-visibility) |
| `GET` | `/orders/:id` | customer, or the browser that placed it | no-store | [Order visibility](#order-visibility) |
| `POST` | `/orders/lookup` | order number and email, rate-limited; captcha when enabled | no-store | [Order visibility](#order-visibility) |
| `GET` `POST` `DELETE` | `/me/wishlist…` | customer | no-store | [Wishlist](#wishlist) |
| `POST` | `/newsletter` | none; captcha when enabled | no-store | [Newsletter](#newsletter) |
| `POST` | `/admin/auth/token` | authorization code and PKCE verifier, or refresh token | no-store | [ADMIN.md](ADMIN.md#authentication) |
| `POST` | `/admin/auth/logout` | admin | no-store | [ADMIN.md](ADMIN.md#authentication) |
| `POST` | `/admin/auth/login` | Odoo API key, for scripts; rate-limited | no-store | [ADMIN.md](ADMIN.md#scripts-and-api-keys) |
| `GET` `POST` `PATCH` `DELETE` | `/admin/products…`, `/admin/variants/:id/inventory` | admin | no-store | [Write API](#write-api-admin) |
| `GET` `POST` `DELETE` | `/admin/categories…` | admin | no-store | [Write API](#write-api-admin) |
| `POST` | `/admin/size-charts` | admin | no-store | [ADMIN.md](ADMIN.md) |
| `GET` `POST` `DELETE` | `/admin/library…`, `/admin/media…` | admin | no-store | [The reuse library](#the-reuse-library) |
| `GET` | `/admin/orders`, `/admin/orders/:id` | admin | no-store | [Admin orders](#admin-orders) |
| `PATCH` | `/admin/orders/:id` | admin | no-store | [Admin orders](#admin-orders) |
| `POST` | `/admin/orders` | admin, server to server | no-store | [Placing an order from a server](#placing-an-order-from-a-server) |
| `POST` | `/admin/orders/:id/refunds` | admin | no-store | [Payments, refunds and secrets](#payments-refunds-and-secrets) |
| `GET` `POST` `DELETE` | `/admin/discounts…` | admin | no-store | [ADMIN.md](ADMIN.md) |
| `PATCH` | `/admin/storefront` | admin | no-store | [Write API](#write-api-admin) |
| `POST` `GET` | `/admin/import`, `/admin/export` | admin | no-store | [Write API](#write-api-admin) |
| `GET` `POST` | `/admin/credentials`, `/admin/notifications/test` | admin | no-store | [Payments, refunds and secrets](#payments-refunds-and-secrets) |

A backend does not need all of it. The catalogue rows open a shop; the rest can
arrive a section at a time, and the theme shows a clear error on a route that is
not there yet rather than a blank page.

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
  "commerce": { "freeShippingOver": 15000, "shippingMethods": [], "countries": [],
    "stock": { "display": "low", "lowThreshold": 3, "hideSoldOut": false } },
  "features": { "wishlist": true, "reviews": true },
  "navigation": { "primary": [], "footer": [], "announcement": { "messages": [] } },
  "home": [{ "type": "hero", "title": "…" }],
  "recommendations": { "strategy": "automatic", "limit": 4 },
  "checkout": { "mode": "redirect", "createUrl": "…" },
  "promises": [],
  "security": { "captcha": null }
}
```

Cache it hard — it changes when a merchant saves settings, not per request.

### Captcha

When a store switches captcha on, the settings document says so:

```json
{
  "security": {
    "captcha": { "provider": "turnstile", "siteKey": "0x4AAAAAAA…", "actions": ["login", "register", "lookup", "newsletter"] }
  }
}
```

`captcha` is `null`, or absent, when it is off — and then nothing loads: no
widget, no script, no request to a captcha provider. The demo never loads one.
With it on, the storefront adds `captchaToken` to the JSON body of each listed
form:

| Action | Request |
| --- | --- |
| `login` | `POST /auth/login` |
| `register` | `POST /auth/register` |
| `lookup` | `POST /orders/lookup` |
| `newsletter` | `POST /newsletter` |

`provider` is `turnstile` — a Cloudflare widget the form shows by its submit
button — or `recaptcha`, Google reCAPTCHA v3, which is invisible and asked for a
token with the action name at submit time. With no `actions` list every form
sends a token. Tokens are single-use, so the form gets a new one after every
attempt.

Verify the token on the server and answer a missing or failed one with
`422 { "code": "captcha_failed", "message": "…" }`. The message is shown on the
form, and the captcha is reset for another try.

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
| `attr` | repeat | `<optionId>:<value name>`, e.g. `attr=12:Navy&attr=13:M`. Either value within one option, every option given |
| `spec` | repeat | `<key>:<value>`, for specifications marked as a facet |
| `brand` | csv | Brand slugs |
| `in_brand` | string | A brand page's scope, like `category`: facets describe only that brand's products (the storefront's `/brands/:slug` sends it) |
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
    "priceRange": { "min": 4800, "max": 68500 },
    "attributes": [
      { "id": "12", "name": "Color", "displayType": "color", "role": "color",
        "values": [{ "name": "Navy", "color": "#22304A", "count": 4 }] }
    ],
    "specs": [
      { "key": "screen_size", "label": "Screen size", "group": "Display", "unit": "in",
        "values": [{ "value": "6.1", "count": 1 }] }
    ],
    "brands": [{ "slug": "nova", "name": "Nova", "count": 1 }]
  }
}
```

`attr` and `spec` repeat rather than join with commas, because their values are
names a merchant typed and a comma in one would split it. The theme renders
`attributes`, `specs` and `brands` when they are present, and falls back to
`sizes` and `colors` for a backend that sends only those. With the store's
`commerce.stock.hideSoldOut` on, sold-out products are left out of listings.

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
    "maker": { "name": "Filatura Sesia", "location": "Biella, Italy" },
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

`returns: { returnable, days }` is the product's own returns policy, or `null` when the store takes no returns. Under
the buy button a product with `returnable: false` says **Final sale — this item cannot be returned**, and one with
`returnable: true` promises its own `days`; without the field the store's `commerce.returnsWindowDays` applies.

### Enrichment

Three blocks, deliberately not one:

Every block renders in the column beside the buy button. Nothing is a full-width
section below the fold any more: a page that asks a shopper to scroll past the
button to find the fabric weight has already lost the shoppers who would not
have scrolled, and they are the majority.

| Block | Where it renders | What it is for |
| --- | --- | --- |
| `highlights` | Under the price, and the first three over the main image | The scan. Six pairs read in two seconds |
| `assurances` | Under the buy button | What happens after the sale — returns, exchange, repair, payment |
| `maker` | First two rows of Manufacturer info | Who wove the cloth, and where |
| `features` | "All details" → Features, a swipeable card row | Two or three things a competitor could not copy-paste |
| `specs` | "All details" → Specifications, one group per slide | The reference table. Nobody reads it end to end |
| `manufacturer` | "All details" → Manufacturer info, with `maker` on top | Compliance |

"All details" sits **between the highlights and the colour picker** — above the
buy button, not below it — and is **open with the first tab rendered**. Tabs
rather than accordions on purpose: a tab shows something on arrival and an
accordion shows nothing, and enrichment that costs an interaction before it can
be read is mostly enrichment that does not get read.

Tab order is `fabric → specs → features → details → manufacturer`, which is the
order the questions arrive: what is it made of, what are the numbers, what is
different about it, how is it built, who made it.

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

`specList` replaces the vocabulary lookup when present:
`[{ key, label, group, groupLabel, value, unit }]`, labelled and grouped by the
store. The Specifications tab, the strip over the first photograph and the
compare table all read it; the bundled vocabulary is used only for a backend
that sends the bare `specs` map. `labels` names the tabs
(`{ fabric, specs, features, details, manufacturer }`, any of them); without it
the tabs are "Materials & care", "Specifications", "Features", "Details" and
"Manufacturer info".

### Any product

Everything below is additive. A backend that sends only `options[].name`,
`options[].values` and `variants[].options` keeps working: the theme derives
option ids from the names and adds to the bag with `variant_id`.

| Field | Where | Notes |
| --- | --- | --- |
| `type` | list, detail | `goods` · `service` · `digital` · `combo` |
| `options[].id` | list, detail | String. Filters use it (`attr=<id>:<value>`) |
| `options[].displayType` | list, detail | `radio` · `pills` · `select` · `color` · `image`. How the picker draws the option |
| `options[].role` | list, detail | `color` · `size` · `null`. Size shows the size chart link and the fit block; colour gives the card its swatches |
| `options[].imagesFollow` | list, detail | The gallery shows images whose `color` is the chosen value of this option, plus untagged ones |
| `options[].mode` | list, detail | `variant`, or `dynamic`: a combination may be missing from `variants[]` and is priced by `POST /products/:slug/combination` |
| `options[].choices[]` | list, detail | `{ id, name, color, image, priceExtra, custom }`. `custom: true` asks the shopper for text |
| `extraOptions[]` | detail | No-variant attributes: `{ id, name, displayType, multiple, required, choices }`. Checkboxes when `multiple`; a "None" row when not `required` |
| `variants[].optionIds` | list, detail | `{ optionId: choiceId }`. Its presence is what tells the theme to add by choices |
| `variants[].inventory` | list, detail | A number, or `null` when the store does not show stock |
| `stock` | list, detail | `{ display, lowThreshold }`. `exact` says "12 in stock"; `low` says "Only 3 left" under the threshold; `hidden` never shows a number |
| `quantity` | list, detail | `{ min, max, step, unit, decimals }`. The product and bag steppers offer only these quantities; a unit other than a count is shown |
| `brand` | list, detail | `{ slug, name, logo }` or `null`. Shown on the card and the product page, linked to `/brands/:slug`, and used as the JSON-LD brand |
| `breadcrumbs` | detail | `[{ slug, name }]`, root to leaf. Without it the theme walks the category tree |
| `images[]` video | detail | `{ type: "video", provider, embedUrl, url, alt }`. `youtube` and `vimeo` show `url` as a poster and load `embedUrl` only when pressed; `file` plays `url` in a video element |
| `combo` | detail, combo only | `[{ id, name, items: [{ id, variantId, productSlug, title, image, options, extraPrice, available }] }]`. One item per group |
| `optionalProducts` | detail | `ProductSummary[]`, offered in a dialog when the product is added |
| `accessories` | detail | `ProductSummary[]`, the "Frequently bought together" rail on the page and in the bag drawer |
| `alternatives` | detail | `ProductSummary[]`, used for "You might also like" instead of `GET /products/:slug/related` |

`ProductSummary` is `{ slug, title, price, compareAtPrice, image, available, type, variantId }`.
`variantId` is set when the row points at one variant; the optional-products
dialog can add those directly, and links to the product page for the rest.

```json
{
  "type": "goods",
  "brand": { "slug": "nova", "name": "Nova", "logo": null },
  "options": [
    { "id": "storage", "name": "Storage", "displayType": "pills", "role": null,
      "imagesFollow": false, "mode": "variant", "values": ["128 GB", "256 GB"],
      "choices": [
        { "id": "storage-128", "name": "128 GB", "color": null, "image": null, "priceExtra": null, "custom": false },
        { "id": "storage-256", "name": "256 GB", "color": null, "image": null,
          "priceExtra": { "amount": 10000, "currency": "USD" }, "custom": false }
      ] }
  ],
  "variants": [
    { "id": "var_1", "options": { "Storage": "256 GB" }, "optionIds": { "storage": "storage-256" },
      "price": { "amount": 79900, "currency": "USD" }, "inventory": 6, "available": true }
  ],
  "stock": { "display": "low", "lowThreshold": 5 },
  "quantity": { "min": 1, "max": 2, "step": 1, "unit": "Units", "decimals": false }
}
```

The picker logic is in `src/lib/variants.js` and the quantity and stock rules in
`src/lib/quantity.js`, both with unit tests. A choice is judged against the
options before it, so the first option is always fully open.

### `POST /products/:slug/combination`

Prices what `variants[]` cannot: a dynamic combination nobody has bought, or
extras on top of a variant. The theme calls it 250 ms after the choices settle.

```json
{ "choiceIds": ["grind-espresso"] }
```

```json
{ "exists": false, "variantId": null, "available": true,
  "price": { "amount": 3200, "currency": "USD" }, "compareAtPrice": null, "imageId": null }
```

`404 not_found` for an unknown product; `422 invalid_combination` for an
excluded or incomplete combination, which the buy button shows as "Not
available".

### Brands

- `GET /brands` → `{ items: [{ slug, name, logo, description, count }], total }`
- `GET /brands/:slug` → `{ slug, name, logo, description, seo: { title, description } }`

The `/brands/:slug` page reads the brand and lists `GET /products?brand=<slug>`.

---

## Attributes

### Staleness across tabs

`GET` responses are cached with a short TTL and served stale-while-revalidate.
Two consequences worth implementing on the real backend too:

- **A background refresh must reach the screen.** The cache announces a
  revalidation whose result differs from what it served, and `useAsync` re-reads
  silently. Without it the refresh lands in storage and the page goes on showing
  what it had — which is how a product reads correctly in one place and wrongly
  in another.
- **A change this tab did not make invalidates everything catalogue-shaped.** In
  mock mode that is a `storage` event from another tab. Against a real API it is
  whatever you have — a websocket, SSE, a poll. The rule is the same: a local
  write purges precisely, a foreign one purges broadly, because nothing local
  can describe it.

### Payments, refunds and secrets

```
POST /carts/:cartId/checkout      create a payment — redirect, razorpay and api modes (see CHECKOUT.md)
POST /payments/verify             razorpay mode: check a signature, place the order
POST /carts/:cartId/payments      payments mode — see On-site payments below
POST /admin/orders/:id/refunds    { amount?, reason?, restock? } → the Order
GET  /admin/credentials           which secrets are set, and when — never values
POST /admin/credentials           write-only
POST /admin/notifications/test    send one email to prove the wiring
```

**`GET /admin/credentials` must not return a value.** A secret that can be read
back is a secret in every log, cache and browser history between the server and
the page:

```json
{ "items": [{ "key": "razorpayKeySecret", "set": true, "updatedAt": "…" }],
  "storesSecrets": true }
```

`storesSecrets: false` tells the admin panel to say so — the bundled demo has no
server, so it records the marker and discards the value.

**`POST /checkout` re-checks stock** and fails `409 out_of_stock` with the
shortfall named per line. See [CHECKOUT.md](CHECKOUT.md) for why, and for the
refund shape.

### `POST /orders/lookup`

```json
{ "number": "LM-10428", "email": "guest@example.com" }   →  the Order
```

Plus `captchaToken` when [captcha](#captcha) is on for `lookup`.

Both fields, and **that is the whole security model**. Order numbers are
sequential in most shops — including this one — so the number alone is
guessable and the email is what turns a lookup into a proof.

Two things a real implementation must do:

- **Rate-limit it.** Matched pairs are cheap to test in bulk otherwise, and a
  store's order volume is a thing competitors like to know.
- **Fail identically** whether the number is wrong, the email is wrong, or
  both. A distinct "that order exists but the email does not match" turns this
  endpoint into an oracle for which order numbers are real.

It exists because guest checkout is the default. Without it a guest who clears
their browser, or opens the confirmation email on a different phone, has no way
back to their own order — so they email support, or assume the order failed and
order again.

### Placing an order from a server

```
POST /admin/orders   { cart_id, email, payment, idempotency_key }  → Order + created
GET  /admin/orders/:id                                             → AdminOrder (an Order plus fulfilment fields)
```

The route a payment webhook uses to turn money that has already moved into an
order. `examples/server/server.mjs` calls it after verifying a Razorpay
signature — and for a while this section did not exist, so a backend built from
these docs would 502 the first time somebody paid.

**`created` is not cosmetic.** A provider retries its webhook, so the same
`idempotency_key` must return the *original* order with `created: false` and
place nothing:

```json
{ "id": "order_…", "number": "LM-10428", "created": false, "…": "…" }
```

Without it, a retry sends a second confirmation email and sells the stock twice.
The reference server branches on exactly this field.

**`GET /admin/orders/:id` is not owner-scoped**, unlike `GET /orders/:id`. That
one gates on the customer session or the browser that placed the order, which is
right for a shopper and useless for a back office. This one gates on the admin
token and returns any order — and it must never redact `payment.reference`,
because the refund route reads it to call the provider.

### Order visibility

`GET /orders` requires a session and returns only that customer's orders.
`GET /orders/:id` opens for its owner, or — when nobody is signed in — for the
browser that placed it, which is what makes guest checkout's confirmation page
work without a password prompt at the worst possible moment.

Two rules worth copying into a real implementation:

- **A signed-in session wins over the browser capability.** Otherwise the second
  person to use a shared laptop can open the first person's order.
- **Refuse with 404, not 403.** "You are not allowed to see this" confirms the
  order exists, which is most of what an attacker enumerating ids wants.

### Discounts

`compareAtPrice` above `price` renders a struck-through original. The **`−N%`
chip and the `sale` badge need at least 5%** (`MIN_DISCOUNT` in
`src/lib/money.js`).

A merchant who sets a compare-at price two dollars above the price otherwise
gets "−2%" in red beside a sale badge. That is worth nothing to a shopper and
costs something: a discount too small to matter reads as a store manufacturing
urgency, and the suspicion does not stay local to the badge. The old price still
shows, because it is a fact; it is just not dressed up as an offer.

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

The response folds in **the store's own library** (below): its attributes appear
alongside the built-ins marked `"custom": true` and win on a key collision, its
saved service rows join `assurances`, and `features` carries whole cards it has
saved for reuse.

### The reuse library

```
GET    /admin/library
POST   /admin/library/:kind          → the saved item
DELETE /admin/library/:kind/:id
```

`:kind` is `attributes`, `features` or `assurances`. Anything else is a 422
`invalid_kind`.

```json
{
  "attributes": [
    { "id": "attribute_x1", "key": "collar_type", "label": "Collar type",
      "group": "general", "values": ["Button-down", "Spread"], "custom": true }
  ],
  "features":   [{ "id": "feature_x2", "icon": "leaf", "title": "…", "body": "…" }],
  "assurances": [{ "id": "assurance_x3", "icon": "shield", "label": "Lifetime repairs" }]
}
```

**The attribute half fills itself in.** `POST /admin/products` reads the
highlights and specifications it just saved, and any key the built-in vocabulary
does not know becomes a suggestion on the next product, with every value seen
against it collected on the key. This is the "promote unrecognised keys for
review" job described in [DATABASE.md](DATABASE.md), run inline.

The reason is worth stating: a merchant listing a hundred shirts types "Collar
type" on the first and, on the sixtieth, cannot remember whether they wrote
"Collar type", "Collar" or "Neck". Three spellings of one attribute is a facet
nobody can filter on and a specification table that compares nothing — and it is
not a discipline problem, it is a missing feature. Reuse should not require
deciding to save.

`features` and `assurances` are saved explicitly, because a whole block of copy
is an editorial choice rather than a vocabulary one.

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

Trees have any depth, and every category carries `path: [{ slug, name }]`, root
to itself. Category pages title themselves and build their breadcrumbs from it
(or from the parents, when it is missing).
### `GET /collections` → `{ items: [{ slug, title, blurb, image, count, seo }], total }`

---

## Search engines

A live store is rendered on request (`server/handler.mjs`, [Deploying](DEPLOY.md)): the server renders each public
address with its data and head, so the backend has to say what search engines and link previews should read.

**Every page's `seo` block.** `GET /products/:slug`, every item of `GET /categories` and `GET /collections`,
`GET /brands/:slug`, `GET /pages/:slug` and `GET /blog/:slug` carry:

```json
{ "seo": { "title": "Merino Crew | Loom", "description": "Soft wool, made to last.", "image": "https://…/image_1024", "noindex": false } }
```

`title` is final (the store's title template already applied) and becomes `<title>`, `og:title` and `twitter:title`;
`description` must never be empty (a page without text of its own gets a sentence naming it); `image` is the preview
for shared links; `noindex: true` writes `robots: noindex` and leaves the page's language alternates out. Without the
block (a backend that has not added it) the theme names pages from their title and the settings' `seo.titleTemplate`.

**Images in sizes.** An image may list the sizes the backend keeps, `srcset: [{width, url}]`; the theme turns them into
a `srcset` so a phone downloads a smaller copy, through the store's image CDN when `media.imageUrlTemplate` is set
([Configuration](CONFIGURATION.md#media)).

**Structured data.** From the same data the theme writes `Product` (brand, SKU, `gtin` from each variant's `barcode`,
one offer per variant, returns window from `commerce.returnsWindowDays` and free delivery over
`commerce.freeShippingOver`), `BreadcrumbList`, `ItemList` on listings, `BlogPosting`, and on the home page
`Organization` (logo, social profiles) and `WebSite` with a search box.

**Read by the render handler, not the browser**, on the storefront's own domain:

| Route | Answer |
| --- | --- |
| `GET /robots.txt`, `GET /sitemap.xml`, `GET /sitemaps/:kind-:page.xml` | Text or XML, passed through unchanged. Every address in them must be a storefront address |
| `GET /redirects?path=/product/old` | `{ to: "/product/new", code: 301 }` or 404. Asked before the handler answers 404; the language prefix is left off the path and put back on the answer |

## Search

`GET /products?q=` searches names, descriptions, tags, references and barcodes. When nothing matches, the backend may
return products with a similar name and say so with `fuzzy: true`; the search page then shows "No exact match for
…". Pages of 24 (`page`).

| Route | Answer |
| --- | --- |
| `GET /search/suggest?q=swea&limit=5` | `{ query, products: [{ slug, title, price, compareAtPrice, image }], categories: [{ slug, name, path }], brands: [{ slug, name }], fuzzy }` for the header search box. Fewer than two characters: empty lists |
| `GET /search/popular?limit=8` | `{ items: ["merino crew", …] }`: the most searched terms that find something, shown on an empty search page |
| `POST /search/log` `{ q }` | Counts one search for the merchant's report; the backend counts the results itself. Sent once per results page |

The header box is a combobox: arrow keys move through the suggestions (`aria-activedescendant`), Enter opens one or
searches, Escape closes the list. The suggestions code loads the first time somebody types.

## Where the shopper came from

The theme keeps the campaign tags (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`) and click IDs
(`gclid`, `gbraid`, `wbraid`, `fbclid`, `ttclid`, `msclkid`, `epik`) of the first and the latest visit that brought
any, with the landing path, the referring site and the time (`src/lib/attribution.js`). A reload or a link inside the
shop changes nothing. Once a bag exists it sends them, once per bag and again when they change:

```http
POST /carts/:id/attribution
{ "first": { "source": "newsletter", "medium": "email", "campaign": "Spring", "landing": "/shop", "at": "2026-09-01T10:00:00.000Z" },
  "last":  { "gclid": "Cj0KCQ…", "landing": "/product/merino-crew", "referrer": "https://www.google.com/", "at": "…" },
  "gaClientId": "123456789.1712345678", "fbp": "fb.1.1712345678901.123", "consent": { "analytics": true, "marketing": false } }
```

`gaClientId` comes from the `_ga` cookie and `fbp`/`fbc` from Meta's cookies, so a backend that reports purchases
itself (GA4 Measurement Protocol, Meta Conversions API) reports them for the same visitor; the theme's own `purchase`
event uses the order number as its ID, so each platform counts the order once. `consent` is only sent when the store
shows a cookie banner. Answer `{ ok: true }`; a backend that ignores it loses nothing but the campaign.

## Cart

The cart lives on the server. Every mutation returns the **whole repriced cart**
and the theme replaces its state wholesale — it never recomputes a total
locally. Discounts, shipping thresholds and tax are server concerns, and a
client that recalculates them will eventually disagree with the invoice.

| Method | Route | Body |
| --- | --- | --- |
| `POST` | `/carts` | `{}` or `{ "fresh": true }` — returns `Cart` (see *Who owns a bag* below) |
| `GET` | `/carts/:id` | 404 if expired; the theme silently creates a new one |
| `POST` | `/carts/:id/lines` | `{ variant_id, quantity }`, or `{ product_slug, choice_ids, quantity }` with the extras below |
| `PATCH` | `/carts/:id/lines/:lineId` | `{ quantity }` |
| `DELETE` | `/carts/:id/lines/:lineId` | |
| `POST` | `/carts/:id/lines/:lineId/save` | Save for later, signed in: the product joins saved items and the line leaves the bag (a guest's is saved in the browser and the line deleted) |
| `GET` | `/carts/:id/slots?method=` | `{ required, slots: [{ id, label, date, from, to, startsAt, endsAt, remaining }], selected }` — delivery slots for a method |
| `GET` | `/carts/:id/pickup-locations?method=&zip=&country=` | `{ locations: [{ id, name, street, city, region, postalCode, country, distanceKm, inStock }], selected }` — shops to collect from, nearest first |
| `POST` | `/carts/:id/pricelist` | `{ pricelist_id }` — moves the bag to another currency's pricelist; returns `Cart` |
| `POST` | `/carts/:id/pickup-location` | `{ method, location_id }` — collect from that shop; returns `Cart` |
| `DELETE` | `/carts/:id/lines` | Empties the cart |
| `POST` | `/carts/:id/discount` | `{ code }` — `""` clears it |
| `POST` | `/carts/:id/codes` | `{ code }` — adds a code, keeping the others |
| `DELETE` | `/carts/:id/codes/:code` | Removes one code |
| `POST` | `/carts/:id/rewards` | `{ coupon_id, reward_id, variant_id? }` — claims one of `claimableRewards` |
| `GET` | `/gift-cards/:code` | `{ balance, expiresAt }` |

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
  "freeShippingRemaining": { "amount": 0, "currency": "USD" },
  "requiresShipping": true,
  "freeShippingProgress": {
    "method": "standard",
    "threshold": { "amount": 15000, "currency": "USD" },
    "remaining": { "amount": 0, "currency": "USD" },
    "percent": 100,
    "reached": true
  },
  "minimumOrder": null
}
```

`freeShippingRemaining` drives the "away from free shipping" line in the cart and drawer; return zero when it does not
apply. `freeShippingProgress` (optional, `null` when nothing ships free) fills the cart's bar with `percent`, measured
by the backend; without it the bar falls back to `subtotal / freeShippingThreshold`. `minimumOrder` (optional,
`{ amount, remaining }` or `null`): while `remaining` is above zero the cart and checkout say how much more is needed
and do not offer checkout. `giftWrap` (optional money) is a gift wrapping charge added at checkout, shown as its own
row. `pickupLocation` (optional, `{ id, name, street, city, region, postalCode, country }` or `null`) is the shop chosen
for a collection method, and `deliverySlot` (optional, `{ id, label, date, from, to, startsAt, endsAt }` or `null`) the
slot booked at checkout; orders carry both too.

`requiresShipping` is `false` when nothing in the bag is shipped (services, downloads, e-gift cards): checkout then
asks only for a name and email, and shows no address or delivery step.

A delivery method marked `pickup: true` in `commerce.shippingMethods` makes checkout list shops
(`getPickupLocations`) and set one (`setPickupLocation`) before the order can be placed; one marked `slots: true` makes
it list slots (`getDeliverySlots`) and send the chosen `delivery_slot`. Neither applies to the demo, and wallet buttons
never offer those methods.

Expected errors: `409 insufficient_inventory`, `409 out_of_stock`,
`422 invalid_discount`.

**The bag follows the backend.** A backend may reprice a bag and drop products
that are no longer on sale whenever it is read or changed. It says so in
`notices` — what changed in that answer, in words for the shopper — and the
theme shows each `message` once as a toast:

```json
"notices": [
  { "type": "price_changed", "lineId": "41", "title": "Merino Crew",
    "from": { "amount": 11500, "currency": "USD" }, "to": { "amount": 17250, "currency": "USD" },
    "message": "The price of Merino Crew changed to $172.50." },
  { "type": "removed", "title": "Wool Scarf", "message": "Wool Scarf is no longer available and was taken out of your bag." }
]
```

`notices` is optional; a cart without it shows nothing.

**Delivery for an address.** Checkout prices delivery for the address as it is
typed with `POST /carts/:id/shipping-options` (`{ address, method? }`), and the
product page's postcode checker asks
`GET /serviceability?country=&region=&postal_code=&variant_id=` →
`{ deliverable, country, region, postalCode, methods: [{ id, label, note, price, arrivesAt, cutoff, shipsToday, guaranteed }] }`
(`price` is `null` when the method is priced per bag).

**Codes, promotions and rewards.** A cart may carry `codes: [{ code, label, amount }]`
(each code with what it takes off), `promotions: [{ name, amount }]` (automatic
discounts), `claimableRewards: [{ id, couponId, rewardId, type, description, products: [{ variantId, title }] }]`
(shown as **Choose your reward**) and free-product lines with `isReward: true`
and `rewardLabel`, which the bag shows without a quantity stepper. "Code
applied" is said only when the cart changed.

**Quantity prices.** A product detail may carry `priceTiers: [{ minQuantity, price }]`,
shown under the price as "5+ items · $80.00 each".

### Adding any product

The theme sends `{ variant_id, quantity }` to a backend whose variants carry no
`optionIds`. Otherwise it sends the product and its choices, with whichever of
these apply:

```json
{
  "product_slug": "brass-pen",
  "choice_ids": ["finish-raw"],
  "extra_choice_ids": ["engraving-initials", "add-gift-box"],
  "custom_values": [{ "choice_id": "engraving-initials", "text": "J.S." }],
  "combo_items": [{ "combo_item_id": "combo-pen-raw" }],
  "optional_products": [{ "variant_id": "var_leather_phone_case", "quantity": 1 }],
  "quantity": 1
}
```

Lines gain `extraOptions: { name: value }`, `customValues: [{ name, text }]`,
`comboItems: [{ title, options, quantity }]`, `linkedTo` (the line an optional
product was added with, or `null`) and `quantityRule`. A combo's items are not
lines of their own. Removing a line removes the lines linked to it.
`PATCH /carts/:id/lines/:lineId` applies the same quantity rule, and changes a
combo's items with it.

| Error | When | The theme |
| --- | --- | --- |
| `422 choose_options` | An option is missing; `detail.missing` names them | Toast: "Choose Storage first." |
| `422 invalid_combination` | Excluded, not made, or text over 200 characters | Toast |
| `422 quantity_rule` | Outside `detail.min`, `detail.max` or `detail.step` | Toast; the steppers never offer such a quantity |
| `422 combo_incomplete` | A group has no item; `detail.groups` names them | Toast: "Choose one for Pen." |

A message in the response body is shown as it is; the sentences above are for a
response that carries only the code.

### Who owns a bag

One customer, one open bag per store. Three rules keep it that way, and each
one exists because a bought item once showed up in the bag again after paying:

- **`POST /carts` with a customer token and no body** returns the customer's
  newest open bag if they have one — signing in on a new device brings the bag
  back — and creates a new one otherwise. A guest always gets a new bag.
- **`POST /carts` with `{ "fresh": true }`** always creates a new, empty bag and
  never reuses an open one. The theme sends it on the first `POST /carts` after
  a bag became an order (classic checkout, or an on-site payment whose response
  carries `order`), right after forgetting the old cart id
  (`src/lib/api/http.js`). Without it, a customer who owned a second open bag
  got that one back — with items that looked already bought.
- **Claiming a guest bag merges.** When a request with a customer token opens a
  guest bag (any cart route), the backend folds the customer's other open bags
  on that store into it and retires them. An item in both keeps the **higher**
  quantity, never the sum; an item that is no longer sellable is skipped. A
  retired bag answers `404 cart_not_found`, which the theme treats like an
  expired one.

A bag that became an order, or has a payment underway or taken, is no longer
open: every cart route answers `404 cart_not_found` for it.

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
> production, either keep this call and have your backend hand the shopper to a
> hosted payment page (`redirect` mode), or let the backend list its gateways and
> run each one's own form on the checkout page (`payments` mode, below). Either
> way the card goes to the gateway's page or iframe and the order is confirmed
> server-side. The address form here is exactly the part that is safe to own.

### On-site payments

Used when `checkout.mode` is `"payments"`: the backend owns the payment
gateways, and the storefront shows them and runs each gateway's own form on the
checkout page. The storefront never records a payment — it asks.

| Method | Route | Returns |
| --- | --- | --- |
| `POST` | `/carts/:id/payment-options` | `{ amount, methods, savedMethods, total }` |
| `POST` | `/carts/:id/payments` | `Payment` |
| `POST` | `/payments/:paymentId/actions/:action` | `Payment` |
| `GET` | `/payments/:paymentId` | `Payment` — never cached |
| `POST` | `/orders/:id/payment-options` | `{ amount, methods, savedMethods, total }` for what is left to pay |
| `POST` | `/orders/:id/payments` | `Payment` for a placed order ("Pay now") |
| `POST` | `/carts/:id/cancel-payment` | `Cart` — cancels a hosted-page payment left open |
| `POST` | `/carts/:id/express-options` | `{ amount, shippingRequired, methods }` — wallet buttons before any address |
| `POST` | `/carts/:id/shipping-options` | `{ options, selected, shipping, tax, total }` for `{ address?, method? }` |

`payment-options` takes the checkout body (`email`, `shipping_address`,
`shipping_method`, `currency`, and optionally `billing_address`, `company_name`,
`vat`, `note`, `gift_message`, `gift_wrap`, `accept_terms` and `delivery_slot`) and applies it to the cart, because what can pay
depends on where the parcel is going and what it costs:

```json
{
  "amount": { "amount": 12800, "currency": "INR" },
  "methods": [
    {
      "id": "3-12", "providerId": "3", "methodId": "12",
      "provider": "razorpay", "providerName": "Razorpay",
      "code": "upi", "name": "UPI", "image": "https://…", "brands": [],
      "flow": "direct", "test": false, "canSave": false, "note": null, "fee": null, "config": null
    }
  ],
  "savedMethods": [{ "id": "7", "providerId": "3", "provider": "stripe", "name": "•••• 4242", "methodName": "Card" }],
  "total": 1
}
```

`flow` decides what the page does: `direct` runs a driver on this page,
`redirect` sends the browser to the gateway's hosted page, `offline` (cash on
delivery, bank transfer) needs nothing from the shopper. A backend leaves out a
method the storefront has no way to show, rather than offer one that can only fail.

`fee` is an extra charge for that method (`{ amount, currency }`, typically cash
on delivery), or `null`. The payment step shows it on the method, and the page's
total and **Pay** button include it; paying with the method adds it to the order,
where cart and order answer it as `fee`. `canSave` shows **Save for next time**,
sent as `save_method`.

`config` holds public values a driver needs to show the gateway's own form
before the payment exists, else `null`. For `stripe`: `{ publishableKey,
apiVersion, currency, amount, captureMethod, paymentMethodType, billingDetails,
tokenizationRequired }`. A Stripe payment's `client` then carries that
PaymentIntent's `client_secret` and a `return_url` on the storefront.

`payments` takes the same body plus `provider_id` and `method_id` (or
`token_id`), `save_method`, `success_url`, `cancel_url` and `expected_total` in
minor units:

```json
{
  "id": "Xq3…opaque", "reference": "S00012-1",
  "provider": "razorpay", "flow": "direct",
  "status": "draft",
  "message": null,
  "client": { "razorpay_key_id": "rzp_live_…", "razorpay_order_id": "order_…", "amount": 12800, "currency": "INR" },
  "redirect": null,
  "order": null
}
```

`status` is `draft`, `pending`, `authorized`, `paid`, `cancelled` or `failed`;
`reason` is `cancelled` or `declined` for the last two, else `null`.
`order` (`{ id, number }`) appears once the order is confirmed — or sent, for a
method that settles later. `client` holds only values a gateway designs to be
public. `id` is the only thing the browser keeps; `reference` is for people.
`client` is filled only on the create response of a `direct` payment — building
it again would open a second order at the gateway — and is `null` on status and
action responses.

**`paid` with `order: null` means the money arrived but the order is still
being confirmed** — for example confirming it failed on the backend (an invoice
PDF that could not be rendered) and will be retried. `message` says so
("Payment received. We are confirming your order and will email you as soon as
it is done."). Keep polling and show the message; never treat it as a failed
payment or offer to pay again.

`actions` are the gateway steps a browser cannot send to the backend's own
payment routes: `demo`/`simulate` with `{ outcome, cardNumber }` (last four
digits), `razorpay`/`complete` with Razorpay's
`razorpay_payment_id`, `razorpay_order_id` and `razorpay_signature`, which the
backend verifies before the payment counts, and `stripe`/`complete` with
`{ payment_intent }`, after which the backend reads that PaymentIntent from
Stripe and checks it is this payment's.

**A hosted payment page comes back through the backend.** For
`flow: "redirect"` the browser follows `redirect.url`; when the gateway returns
the shopper, the backend sends them on to the storefront's
`/checkout/return?payment=<id>`, which polls `GET /payments/:id` and opens the
order.

What the backend must do, whatever its payment system:

- **Take the amount from the order, never from the request.** `expected_total`
  only lets the backend refuse with `409 cart_changed` when the bag moved.
- **Lock the order** while a payment is created (`409 payment_in_progress`), and
  refuse one that is already paid (`409 already_paid`).
- **Make `id` random and store only its hash.** It is the capability for the
  status and action routes; a copied database must not hand them out.
- **Put only public values in `client`** — the ones the gateway itself sends to a
  browser. Never a secret key.
- **Believe the gateway, not the browser.** An action's payload counts only after
  its signature is verified; otherwise wait for the gateway's webhook.
- **Confirm the order exactly once.** `GET /payments/:id` may be the first to see
  a final payment — confirm the order there, idempotently, and answer
  `409 retry` if a concurrent request holds the lock.
- **Never roll back a recorded payment because confirming the order failed.**
  Record what the gateway reported first; if confirming, invoicing or emailing
  then fails, keep the payment, answer `paid` with `order: null` and a message,
  and retry the confirmation (on the next status read and in the background).

**Apple Pay and Google Pay.** `express-options` lists wallet methods (Stripe
with Express Checkout) with the same `config` as the card form. The bag and
checkout pages mount Stripe's Express Checkout Element with them
(`lib/payments/express.js`). While the sheet is open the wallet shares only a
partial address (`{ city, region, postalCode, country }`), which
`shipping-options` prices; its `total` becomes the sheet's amount. On confirm
the full address, email and phone go through `POST /carts/:id/payments` with
`expected_total`, exactly like checkout. `shipping-options` is also the route
for address-aware delivery prices generally.

**A bag with a payment page open cannot change.** While a `redirect` payment of
the bag is open (Odoo: 30 minutes), cart edits answer `409 payment_in_progress`
and the cart carries `paymentInProgress: true`. The bag and the drawer show the
message with **Cancel payment**, which posts `/carts/:id/cancel-payment`.

**Paying for a placed order.** An `Order` with `canPay: true` shows **Payment
due** and **Pay now** on its page. `POST /orders/:id/payment-options` (body `{}`)
and `POST /orders/:id/payments` (`provider_id` and `method_id` or `token_id`,
`save_method`, `success_url`, `cancel_url`) work like the cart routes for
`amountDue`. `/order/:id?pay=1` opens the methods straight away; a failed hosted
payment of an order returns there. `409 nothing_to_pay` once it is paid.

Expected errors: the checkout errors, `422 no_payment_methods`,
`422 invalid_payment_method`, `409 cart_changed`, `409 payment_in_progress`,
`409 already_paid`, `403 invalid_signature`, `404 unsupported_action`,
`409 retry` (poll again). All codes: [ERRORS.md](ERRORS.md).
See [CHECKOUT.md](CHECKOUT.md) for the flows and how to add a gateway driver.

---

## Orders and account

| Method | Route | Returns |
| --- | --- | --- |
| `GET` | `/orders?page=&per_page=` | `{ items: Order[], total, page, perPage }` (`listOrders({ page })`) |
| `GET` | `/orders/:id` | `Order` |
| `POST` | `/auth/login` | `{ token, customer }` |
| `POST` | `/auth/register` | `{ token, customer }` |
| `POST` | `/auth/logout` | `{ ok: true }` |
| `GET` | `/me` | `Customer` — **401 when signed out is expected**, not an error |
| `PATCH` | `/me` | `Customer` |
| `POST` | `/me/addresses` | `Customer` |
| `PATCH` | `/me/addresses/:id` | `Customer` |
| `DELETE` | `/me/addresses/:id` | `Customer` |
| `GET` | `/me/payment-methods` | `{ items: [{ id, name, provider, method }], total }` — saved by the payment providers |
| `DELETE` | `/me/payment-methods/:id` | The same list, without that one |
| `GET` | `/me/loyalty` | `{ items: [{ id, program, type, points, pointName, balance, expiresAt, history }], total }` — **Account → Rewards** |
| `GET` | `/countries/:code` | `Country` — states and required address fields. Public, cacheable |

Address endpoints return the **whole customer**, not the address, so the account
page never has to merge state by hand.

`POST /auth/login` and `POST /auth/register` also carry `captchaToken` when
[captcha](#captcha) is on for them.

**Addresses are validated on the server**, at checkout and in the address book
alike. A refused address answers `422 invalid_address` with the fields to fix and
a message that names them:

```json
{ "message": "Please add the state / region.", "code": "invalid_address", "detail": { "fields": ["region"] } }
```

The checkout and account forms mark exactly those fields. A typed state that is
not one of the country's gets its own message: `"Gujrat" is not a state of India.
Use the state's full name or its code.`

`GET /countries/:code` is what keeps that from happening:

```json
{
  "code": "IN", "name": "India", "stateRequired": true, "zipRequired": true,
  "states": [{ "code": "GJ", "name": "Gujarat" }, { "code": "MH", "name": "Maharashtra" }],
  "fields": ["line1", "line2", "city", "region", "postalCode", "country"],
  "labels": { "region": "State", "postalCode": "PIN code" }
}
```

`fields` (optional) lists the address fields in the country's own order, and leaves out what the country does not
use: no `postalCode` for a country without postcodes. `labels` (optional) are the words shoppers there use. The
checkout, billing and address-book forms lay out city, state, postcode and country in that order with those words,
mark the postcode optional when `zipRequired` is false, and fall back to today's form (a required "Postcode", "State
/ region") when a backend sends neither.

When `states` has entries, **State / region** is a dropdown of those codes — the
same codes the backend matches, so a picked state is never refused. An empty list,
or a `404` for an unknown code, keeps a free-text box. An address's `region` is
the state code whenever the country has a list; a saved state *name* is settled on
its code the next time the form opens. The demo adapter answers from
`src/data/regions.js`, a copy of Odoo's country data.

```json
{
  "id": "order_1", "number": "LM-10428", "status": "placed",
  "placedAt": "2026-09-09T10:14:00.000Z",
  "lines": [ /* CartLine */ ],
  "subtotal": {}, "discount": {}, "shipping": {}, "tax": {}, "total": {},
  "shippingAddress": { }, "email": "sam@example.com",
  "tracking": { "carrier": "DHL", "code": "JD014600…", "url": "https://…" },
  "payment": { "provider": "demo", "status": "captured", "method": "Card", "amount": {}, "capturedAt": "2026-09-09T10:15:02.000Z" },
  "fee": { "amount": 0, "currency": "INR" },
  "amountDue": { "amount": 0, "currency": "INR" }, "canPay": false,
  "refundedTotal": { "amount": 0, "currency": "INR" }
}
```

`status` — `quote` `placed` `paid` `fulfilled` `delivered` `cancelled` `refunded` (`quote`: a quote request not yet confirmed).

`amountDue` is what is left to pay, and `canPay` says the order page may offer
**Pay now** for it (never for cash on delivery, which is paid at the door).
`refundedTotal` is money given back; the page lists it under the total. `fee`,
`amountDue`, `canPay` and `refundedTotal` are optional: an order without them
shows neither. `billingAddress` (when it is not the delivery address), `company`
and `vat` show a Billing block on the order page. The Customer carries `company`
and `vat`, and each address a `type` (`shipping` or `billing`).

A paid order with digital products adds `downloads: [{ id, name, url }]`, listed
on the order page. `url` is `GET /orders/:orderId/downloads/:documentId`; a bare
path is resolved against the API base URL. It streams the file to the order's
owner, or to the holder of the order link, and answers `404` before payment.

`payment` is `null` until the order has a payment. Its `status` is `pending`,
`authorized`, `captured`, `cancelled` or `failed`. **`captured` is what
`GET /payments/:id` calls `paid`** — the two routes describe the same completed
payment in their own vocabulary.

---

## Accounts and sign-in

Everything a customer does with their account beyond signing in. The adapter functions (in `src/lib/api/http-account.js`,
loaded with the first of them) are named in brackets; the backend's detail is the Odoo addon's `docs/API_REFERENCE.md`.

| Method | Route | Returns |
| --- | --- | --- |
| `POST` | `/auth/password/forgot` `{ email }` | `{ ok }` — the same whether or not the email has an account (`forgotPassword`) |
| `POST` | `/auth/password/reset` `{ token, password }` | `{ token, customer }` — from `/reset-password?token=` (`resetPassword`) |
| `POST` | `/auth/signup` `{ token, password }` | `{ token, customer }` — from an invitation, `/create-account?token=` (`signupWithToken`) |
| `POST` | `/auth/verify` `{ token }` · `/me/verify/resend` | `{ ok }` — `/verify-email?token=`; the Customer carries `emailVerified` (`verifyEmail`, `resendVerification`) |
| `POST` | `/me/password` `{ current, password }` | `{ ok }` — other sessions end (`changePassword`) |
| `POST` | `/me/email` `{ email, password }` | `{ ok, pendingEmail }`; `/confirm-email?token=` calls `POST /auth/email/confirm` (`changeEmail`, `confirmEmailChange`) |
| `GET` | `/me/export` | A JSON file of what the store keeps about the customer (`exportData` → Blob) |
| `POST` | `/me/delete` `{ password, stopEmails }` | `{ ok }` — the account is closed and this browser signed out (`deleteAccount`) |
| `POST` | `/auth/otp/request` `{ phone }` · `/auth/otp/verify` `{ phone, code }` | `{ ok }` · `{ token, customer }` when `features.phoneLogin` (`requestLoginCode`, `verifyLoginCode`) |
| `POST` | `/auth/oauth/start` `{ provider }` · `/auth/oauth` `{ state, accessToken }` | `{ url, state }` · `{ token, customer }` for `features.socialLogin: [{ id, name, label }]`; the provider returns to `/login/oauth` (`startOAuth`, `finishOAuth`) |
| `GET` | `/me/company` | `{ company, role, canManage, members }` (`getCompany`); `POST /me/company/members`, `PATCH`/`DELETE /me/company/members/:id` (`inviteMember`, `updateMember`, `removeMember`) |
| `POST` | `/carts/recover` `{ order, token }` | The bag from the abandoned-cart email, `/cart?recover=…&order=…` (`recoverCart`). A registered customer's bag answers `401 sign_in_required` until they sign in |
| `POST` | `/carts/:id/quote` `{ note }` | `{ orderId, number }` when `features.quotes` (`requestQuote`) |

`POST /auth/register` also takes `company`, `vat` and `newsletter` with `newsletterConsent`. The sign-in page offers a
text-message code and provider buttons when the store has them.

## After the order

| Method | Route | Returns |
| --- | --- | --- |
| `GET` | `/orders/:id/invoices/:invoiceId` | The invoice PDF — `order.invoices: [{ id, number, kind, date, total, paymentState, url }]`, saved with `downloadFile` |
| `POST` | `/orders/:id/cancel` `{ reason }` | `Order` — `order.cancellation: { mode: cancel, refund or request, requestedAt }` says what the button does, or is `null` when the order can no longer be cancelled from the storefront (`cancelOrder`) |
| `POST` | `/orders/:id/messages` `{ body }` | `Order` — a message to the store about the order, up to 2000 characters, while `order.messages.canReply` (`sendOrderMessage`). `403 messages_closed`, `422 empty_message`, `429 rate_limited` |
| `POST` | `/orders/:id/reorder` `{ cart_id }` | `Cart` with `notices` — the order's items in the bag (`reorder`) |
| `GET` | `/orders/:id/returns` | `{ options: { days, until, methods, reasons, lines, unavailable, approval, refundTiming }, items: Return[] }` (`getOrderReturns`) |
| `POST` | `/orders/:id/returns` `{ method, note, lines: [{ lineId, quantity, reasonId, comment }], photos }` | `Return` (`createReturn`); `POST /orders/:id/returns/:returnId/cancel` (`cancelReturn`) |
| `GET` | `/returns` | `{ items: Return[], total }` — **Account › Returns** (`listReturns`) |

The Order adds `timeline: [{ kind, at }]` (placed, paid, shipped, delivered, refunded, cancelled), `invoices`,
`cancellation`, `cancelRequest`, `messages`, `returnCount`, `canReorder` and `canReturn`:

- `cancelRequest`: `{ status: pending | declined | accepted, requestedAt, reason, answeredAt, answer }` or `null`. The
  order page says a request is waiting, shows the team's `answer` when it is declined (no cancel button then:
  `cancellation` is `null`), and the answer, if any, once accepted and the order is cancelled.
- `messages`: `{ canReply, items: [{ id, from: customer | store, author, body, at, returnNumber }] }`, oldest first,
  or `null` when the store keeps order messages off — the order page then shows no **Messages**. `body` is plain text
  and may hold line breaks; `returnNumber` is `''` or the return a message is about.
- `returnCount`: the order's returns. The order page shows **Returns** when it is above 0 or `canReturn` is true, and
  only then asks for `GET /orders/:id/returns`.

Return `options` also carry how the store handles returns: `approval` (`automatic`, `team`, `mixed`, or `null` when
nothing can go back), `refundTiming` (`manual`: the team refunds; `received`: automatically once the items are back;
`approved`: as soon as the return is approved), `reasons[].needsReview` (a return with that reason always waits for the
team), `lines[].until` (the last day that line can go back) and `unavailable: [{ lineId, title, options, image, reason:
final_sale | window_over, until }]`, delivered items shown greyed with the reason. The form says what to expect from
`approval` and `refundTiming` before it is sent.

A Return is `{ id, number, status, method, createdAt, orderId, orderNumber, lines, instructions, rejectReason, value,
canCancel, approvedAutomatically, refundTiming, refunded }`; `status` is `requested`, `approved`, `received`,
`refunded`, `exchanged`, `credited`, `rejected` or `cancelled`, and `refunded` is `{ amount, currency }` once money
went back. `POST /orders/:id/returns` can answer `approved` (with `instructions`) or `refunded` straight away when the
store's rules allow it, and the form says so instead of "sent".

A company allowed to pay on invoice gets a payment method with `code: "invoice"` and `flow: "offline"`; choosing it
sends `payOnInvoice: true` with `createPayment` and the order is placed without a gateway.

## Reviews, questions and alerts

| Method | Route | Returns |
| --- | --- | --- |
| `POST` | `/products/:slug/reviews` `{ rating, title, body, size, height, fit, photos, name, email }` | `{ id, status: approved or pending }` — who may write one is `features.reviewPolicy` (`createReview`); `?review=1` on a product page opens the form |
| `GET` | `/products/:slug/questions` | `{ items: [{ id, question, answer, author, askedAt, answeredAt }], total }` when `features.questions` (`getQuestions`) |
| `POST` | `/products/:slug/questions` `{ question, name, email }` | `{ id, status: pending }` (`askQuestion`) |
| `POST` | `/products/:slug/alerts` `{ variantId, kind: stock or price, email }` | `{ ok, status: waiting }` — **Email me when it is back** on a sold-out option, when `features.stockAlerts` (`createAlert`) |
| `POST` | `/alerts/unsubscribe` `{ token }` | `{ ok }` — from `/alerts/unsubscribe?token=` (`stopAlerts`) |

Photos are `[{ name, data }]`, `data` a data URL; up to three, 5 MB each. `review`, `question` and `alert` are captcha
actions. `features.liveChat: { provider: 'odoo', origin, loaderUrl }` loads Odoo's live chat once the page is idle
(and only with analytics consent when the store asks for consent).

## Pages, contact, consent, access and blog

Everything a shopper reads on a live store comes from the backend. The theme carries no pages, promises or brand
of its own; the demo's live in `src/data/storefront.js` and `src/data/pages.js` and only the demo adapter reads them.
`npm run build` fails a live-store build that still contains demo copy (`scripts/brand-leak.mjs`).

- `GET /pages/:slug` → `{ slug, title, intro, seo, blocks }`. Blocks: `{ type: 'text' | 'table' | 'image' | 'faq' |
  'contact' | 'contact-form', h, p, html, table, image }`. `/pages/:slug` renders them; consecutive `faq` blocks become
  an accordion, `contact` shows `store.contact`, `contact-form` loads the contact form.
- `POST /contact` `{ name, email, message, phone, subject, order, captchaToken }` → `{ ok }` (`contact` captcha action).
- `POST /consents` `{ anonymousId, choices: { analytics, marketing }, policyVersion }` → `{ ok }`. With
  `storefront.consent.enabled`, the banner (`src/components/consent/ConsentBanner.jsx`) asks once per policy
  version; in opt-in mode `track()` sends nothing until the visitor agrees, and Google Consent Mode v2 defaults
  and updates are pushed to `dataLayer`.
- `storefront.access: { mode, message }`. When `mode` is not `open`, the shop is replaced by the maintenance or
  password screen. `POST /access { password }` (or `POST /admin/access` for a signed-in admin) →
  `{ token, header, expiresAt }`; the token is sent as `X-Loom-Access` on every call. A `401 store_locked` or
  `503 store_maintenance` answer drops the token and shows the screen again.
- `storefront.theme: { colors, fonts, radius, faviconUrl, ogImageUrl, logoDarkUrl }` is applied as the CSS custom
  properties in `src/index.css` (`src/lib/theme.js`), in the prerendered HTML too. `storefront.store.contact` fills
  the footer and the contact block; `storefront.store.credit` is an optional credit line.
- `GET /blog` `{ page, per_page, tag }` → `{ items, total, page, perPage, tags }`; `GET /blog/:slug` → a post with
  `contentHtml`. Shown at `/blog` and `/blog/:slug` when `features.blog` is on.
- A settings call that fails on a live store shows "Store unavailable" with a retry, never the demo.

## Wishlist

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/me/wishlist` | `{ items: Product[], total }` |
| `POST` | `/me/wishlist` | `{ product_slug }` |
| `DELETE` | `/me/wishlist/:slug` | |
| `POST` | `/me/wishlist/merge` | `{ product_slugs }` — what a guest saved joins the account; called right after sign-in |

The heart button updates optimistically and rolls back if the call fails, so
these can be slow without the grid feeling slow.

A guest can save items too. The API adapter keeps their slugs in `localStorage` (`loom.wishlist`), lists them with
`GET /products?slugs=a,b` (at most 100), and merges them into the account after `login` or `register`. A merge that
fails keeps them for the next sign-in.

---

## Newsletter

`POST /newsletter` with `{ email, source, consent }` → `{ ok: true, status }`, plus `captchaToken` in the body when
[captcha](#captcha) is on for `newsletter`. `422 invalid_email` for a malformed address.

Subscriptions are double opt-in: `status` is `pending` while the confirmation email is on its way (the footer says to
check the inbox) and `confirmed` when the address was already subscribed. `consent` is the wording the visitor agreed
to; `source` is `footer`, `register` or `checkout` (sign-up and checkout send `newsletter: true` with the wording).
The email's links open `/newsletter/confirm?token=` and `/newsletter/unsubscribe?token=`, which call
`POST /newsletter/confirm` and `POST /newsletter/unsubscribe` with `{ token }`.

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
| `GET` | `/admin/categories` | `{ items, total }` — the `/categories` tree, including empty categories |
| `POST` | `/admin/categories` | `{ slug, name, parent, blurb }` |
| `DELETE` | `/admin/categories/:slug` | Children are promoted to the deleted node's parent |
| `GET` | `/admin/orders?q=&status=&payment=&delivery=&page=&per_page=` | `{ items: AdminOrder[], total, page, perPage, counts }` |
| `GET` | `/admin/orders/:id` | `AdminOrder` — id, order number or backend id |
| `PATCH` | `/admin/orders/:id` | `{ action, tracking? }` → `AdminOrder` — ship, update_tracking, deliver, record_payment, cancel |
| `GET` | `/admin/storefront` | The storefront document plus `admin: { editable, canEdit, backendUrl }` |
| `PATCH` | `/admin/storefront` | Deep-merged; arrays replace. A backend may accept only `admin.editable` paths (`422 unsupported_setting`) |
| `POST` | `/admin/import` | `{ mode, products, categories, collections, settings }`, or `{ csv }`; `dry_run: true` checks without saving |
| `GET` | `/admin/export` | The same shape, a page at a time; `?format=csv` one row per variant |
| `POST` | `/admin/orders` | A paid webhook's `{ cart_id, email, payment, idempotency_key }`, or a phone order's `{ email, lines, shipping_address, shipping_method, payment: link, record or quote }` → AdminOrder with `created`, `paymentUrl` |
| `GET` `POST` | `/admin/discounts` | `{ items, total }`; save `{ id?, code, label, kind, value, active, automatic, minimumAmount, startsOn, endsOn, usageLimit }` |
| `DELETE` | `/admin/discounts/:code` | Removed (archived on Odoo) |
| `POST` | `/admin/notifications/test` | `{ to? }` → `{ delivered, message, preview }` |
| `GET` `PATCH` | `/admin/returns`, `/admin/reviews`, `/admin/questions` and `/:id` | `{ items, total, page, perPage, counts }`; `{ action, reason, reply or answer }` |
| `GET` | `/admin/dashboard?days=30` | Orders, revenue, visits, conversion, abandoned carts, per day |

Three things that are easy to get wrong:

- **Prefer the inventory delta over the set.** Two people adjusting the same SKU
  with `set` silently overwrite each other; with a delta both land, and a
  replayed webhook keyed on `operationId` is a safe no-op.
- **A product price change must cascade to its variants** unless a variant has
  an explicit override — or you sell at last month's price.
- **`GET /admin/products/:id` must return what you store**, because the editor
  sends the whole record back on every save: prices before pricelists and tax,
  every tag, and fit, fabric and the product's own size chart even where a
  category hides them. Saving an unchanged record must change nothing — the full
  list of round-trip rules is in [ADMIN.md](ADMIN.md).

### Admin orders

`AdminOrder` is the customer `Order` plus what the back office needs to move it
along:

```json
{
  "id": "…", "number": "S00011", "status": "placed", "…": "every Order field",
  "backendId": "42",
  "backendUrl": "https://odoo.example/odoo/sales/42",
  "customer": { "name": "Sam Rivera", "email": "sam@example.com", "phone": "+1 555 0134" },
  "orderState": "quotation",
  "paymentStatus": "pending",
  "delivery": {
    "status": "to_ship", "method": "Standard",
    "shippedAt": null, "deliveredAt": null,
    "carrier": "", "trackingCode": "", "trackingUrl": "",
    "references": ["WH/OUT/00013"]
  },
  "actions": ["ship", "deliver", "record_payment", "cancel"]
}
```

| Field | Values |
| --- | --- |
| `orderState` | `quotation` `confirmed` `cancelled` |
| `paymentStatus` | `paid` `partially_refunded` `refunded` `authorized` `pending` (incl. cash on delivery) `failed` `unpaid` |
| `delivery.status` | `none` (nothing to deliver) `to_ship` `shipped` `delivered` `cancelled` |
| `actions` | Allowed right now, in display order: `ship` `update_tracking` `deliver` `record_payment` `cancel` `refund`, and `accept_cancel` `decline_cancel` while the customer's request to cancel waits |
| `cancelRequest` | The customer `Order.cancelRequest`: `{ status, requestedAt, reason, answeredAt, answer }` with `status` pending, declined or accepted, or `null` |
| `refundable` | `{ amount, currency }` still refundable; the refund dialog's maximum |

`backendId` and `backendUrl` are `null` in the demo.

`GET /admin/orders` filters combine; `all` or an empty value ignores one, and an
unknown value is `422 invalid_filter`:

| Parameter | Values |
| --- | --- |
| `q` | Order number, customer name or email, tracking number |
| `status` | `placed` `paid` `fulfilled` `delivered` `cancelled` (the customer `Order.status`) |
| `payment` | `paid` `authorized` `pending` `failed` `unpaid`, or `awaiting` = not cancelled and `pending` **or** `unpaid` |
| `delivery` | `none` `to_ship` `shipped` `delivered` `cancelled` |
| `page`, `per_page` | Default 25, maximum 100 |

The list's `counts` — `{ toShip, shipped, delivered, awaitingPayment, cancelled }`
— label the filter tabs. Each one is **exactly the `total` its tab's filter
returns**, counted over every order whatever filter or page is open: a tab that
says 1 lists one order.

| Count | Equals the `total` of | Contains |
| --- | --- | --- |
| `toShip` | `delivery=to_ship` | Not shipped yet, not cancelled |
| `awaitingPayment` | `payment=awaiting` | Money not received yet: a payment still pending (Cash on Delivery, a bank transfer) or no payment recorded at all. Cancelled orders are left out |
| `shipped` | `delivery=shipped` | On the way, not yet marked delivered |
| `delivered` | `delivery=delivered` | Marked delivered |
| `cancelled` | `status=cancelled` | Cancelled |

Build each count from the same predicate as its filter, never a separate rule. A
count that includes `unpaid` while the tab lists only `pending` shows a number
over an empty list.

`PATCH /admin/orders/:id` takes exactly one action:

```json
{ "action": "ship", "tracking": { "carrier": "Delhivery", "code": "AWB123", "url": "https://…" } }
{ "action": "update_tracking", "tracking": { "code": "AWB124" } }
{ "action": "deliver" }
{ "action": "record_payment" }
{ "action": "cancel" }
{ "action": "accept_cancel", "message": "Cancelled as you asked. The refund is on its way." }
{ "action": "decline_cancel", "message": "Your parcel has already left our warehouse." }
```

Every tracking field is optional, and one left out of `update_tracking` is kept. `accept_cancel` cancels the order
(voiding or refunding its payment) and `message` is optional; `decline_cancel` needs a `message`. Either message goes
to the customer by email and on their order page.
Shipping an order moves the customer's `Order.status` to `fulfilled` and fills
`Order.tracking`; delivering moves it to `delivered`.

| Status | Code | When |
| --- | --- | --- |
| 404 | `not_found` | No such order |
| 403 | `not_allowed` | The signed-in user may not change orders or deliveries |
| 409 | `action_not_allowed` | The action is not in the order's `actions` |
| 409 | `cannot_ship` | The backend could not complete the delivery, with its reason |
| 409 | `already_shipped` / `not_shipped` / `nothing_to_record` | The order moved on since it was loaded |
| 422 | `invalid_action` | Not one of the actions above |
| 422 | `message_required` | `decline_cancel` without a message |
| 422 | `invalid_tracking` | The link is not `http(s)://`, or the number is over 128 characters |

**The actions are a state machine, and the backend owns it.**

| From | Action | To | What the backend does |
| --- | --- | --- | --- |
| To ship | `ship` | Shipped | Confirms a quotation paid offline, completes the delivery (stock leaves once), stores the tracking |
| Shipped or delivered | `update_tracking` | Unchanged | Replaces the tracking fields it was sent |
| To ship or shipped | `deliver` | Delivered | Ships first if needed, then records the delivery |
| Awaiting an offline payment | `record_payment` | Paid | Marks the cash or transfer received and confirms the order |
| Not shipped | `cancel` | Cancelled | Cancels the order and its open deliveries; the stock returns |
| Customer asked to cancel | `accept_cancel` | Cancelled | Cancels as above, voids or refunds the payment, answers the request |
| Customer asked to cancel | `decline_cancel` | Unchanged | Answers the request with the message; the customer can no longer ask |

`actions` is recomputed on every answer and checked again inside the write, so a
second click on **Mark as shipped** answers `409 action_not_allowed` rather than
shipping twice. A backend that keeps discounts, refunds or store settings in its
own screens should answer those admin routes with a `404` whose message says
where to go, not a bare not-found.

The older `{ "status": "fulfilled" | "delivered" | "cancelled" }` body maps to
`ship`, `deliver` and `cancel`.

`POST /admin/import` is what a nightly ERP dump should use. A thousand
individual writes is a thousand transactions, a thousand cache purges, and a
rate limit you will hit.

---

## Webhooks out

Push changes to the storefront so it can purge rather than wait for a TTL. The
render handler answers `POST /__loom/revalidate`:

```
POST https://shop.example.com/__loom/revalidate
X-Loom-Signature: t=1789441234,v1=<hex HMAC-SHA256 of "t.body" with LOOM_WEBHOOK_SECRET>
{ "id": "…", "event": "content.changed", "store": "shop", "data": { "paths": ["/product/merino-crew", "/shop"], "all": false } }
```

`content.changed` purges `data.paths` (or everything with `all: true`);
`product.changed` with `{ slug }` purges that product and `/shop`. A signature
older than five minutes, missing or wrong answers `401`; without
`LOOM_WEBHOOK_SECRET` the endpoint answers `404`. The Odoo module sends exactly
this (**Connect cache purge** on the store), and its webhooks also carry
`order.*`, `return.*` and `customer.created` for other systems.

Sign the payload and verify it — an unauthenticated revalidation endpoint is a
free cache-flush attack.

### `POST /events`

`{ events: ["visit" | "product_view" | "add_to_cart" | "checkout"] }` → `204`.
Day totals for the backend's dashboard, sent with `navigator.sendBeacon` as
`text/plain`: a visit once per browser session, and the other three as they
happen. Nothing identifies the visitor. Optional: a backend without it answers
404 and nothing changes for the shopper.

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
