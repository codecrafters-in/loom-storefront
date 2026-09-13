# Configuration

Everything a merchant would change without touching code.

## Deployment modes

| Mode | `VITE_DATA_SOURCE` | Where data lives | Admin panel writes to |
| --- | --- | --- | --- |
| Demo | `mock` | `localStorage` (`src/lib/db.js`) | The same local store the shop reads |
| Existing system | `api` | Odoo, Shopify, Medusa, your ERP | Your `/admin/*` endpoints |
| Own backend | `api` | [Your database](DATABASE.md) | Your `/admin/*` endpoints |

The last two are the same as far as the storefront is concerned — it calls an
API either way. The difference is who owns the schema, and whether you need
[DATABASE.md](DATABASE.md).

**In `mock` mode the admin panel and the storefront share one database**, so an
edit in admin is on the shop immediately with no publish step. That is a
property of the demo store, not a simplification of the architecture: in `api`
mode the same admin screens call the same documented write endpoints.

## Where settings come from

Three layers. Higher wins.

| Priority | Source | Changes at | Use for |
| --- | --- | --- | --- |
| 1 | `GET /storefront` | Runtime | Anything a merchant edits — menu, home page, currency |
| 2 | `VITE_*` environment | Deploy | Which API to talk to, per-environment overrides |
| 3 | `src/data/storefront.js` | Build | Defaults, and the fallback when the API is unreachable |

The merge is deep, **except arrays, which replace wholesale**. An admin panel
that sends four home sections means four — not four merged onto the seven that
were there. This matters: array-merging config is how you end up with a home
page nobody can delete a section from.

If `GET /storefront` fails, the store falls back to layer 2 + 3 and keeps
selling. A settings outage should not be a blank page. In development the
fallback is logged; in production it is silent.

---

## Environment variables

```bash
cp .env.example .env.local
```

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `mock` | `mock` or `api` |
| `VITE_API_BASE_URL` | — | Required when `api`. No trailing slash |
| `VITE_API_TOKEN` | — | `Authorization: Bearer`. Publishable keys only |
| `VITE_API_TIMEOUT` | `12000` | Milliseconds before a request aborts |
| `VITE_API_CACHE` | `on` | `off` stops the **browser** reusing API responses, so a backend edit shows on the next load. For development. Server rendering and the prerender always cache — a render cannot await, it reads what was fetched first — so the build is the same either way |
| `VITE_STORE_NAME` | `LOOM` | |
| `VITE_CURRENCY` | `USD` | ISO 4217 |
| `VITE_LOCALE` | `en-US` | Number and date formatting |
| `VITE_FREE_SHIPPING_OVER` | `150` | Major units |
| `VITE_MOCK_LATENCY` | `220` | Fake delay in mock mode, ms. `0` disables |
| `VITE_REPO_URL` | this repo | Footer source link |
| `VITE_ADMIN_USER` | `admin` | Demo back-office username. **Mock mode only** |
| `VITE_ADMIN_PASSWORD` | `admin` | Demo back-office password. **Mock mode only** |

In `api` mode the admin credential is checked by your server at
`POST /admin/auth/login` and those two variables are ignored. They are compiled
into the bundle like every `VITE_` variable, so they gate a browser-local demo
and nothing more — see [ADMIN.md](ADMIN.md#authentication).

> **Vite inlines every `VITE_*` variable into the JavaScript bundle.** Anything
> here is readable by anyone who opens devtools. Publishable keys are fine;
> secret keys, database URLs and webhook signing secrets are not, ever.

Setting `VITE_DATA_SOURCE=api` without `VITE_API_BASE_URL` throws at boot with
a readable message rather than firing requests at `undefined`.

---

## The storefront document

Served by `GET /storefront`. Defaults live in `src/data/storefront.js`.

Everything below is optional — omit a key and the default applies.

### `store`

```json
{
  "store": {
    "name": "LOOM",
    "tagline": "Considered clothing, made to be kept.",
    "description": "Used as the meta description.",
    "logo": { "wordmark": "LOOM", "mark": "loom", "imageUrl": null, "height": 22 },
    "email": "help@loom.example"
  }
}
```

`logo.imageUrl` set to a URL uses that artwork. Left `null`, the theme draws its
built-in mark, which inherits `currentColor` and stays sharp at any size. See
[THEMING.md](THEMING.md#the-logo).

### `pricing`

```json
{
  "pricing": {
    "currency": "USD",
    "locale": "en-US",
    "currencies": [
      { "code": "USD", "label": "US Dollar", "symbol": "$" },
      { "code": "INR", "label": "Indian Rupee", "symbol": "₹" }
    ],
    "showTaxNote": true,
    "taxNote": "Tax calculated at checkout."
  }
}
```

`showTaxNote` renders `taxNote` under the cart totals.

- `currency` is the display default and what `Intl.NumberFormat` formats with.
- `currencies` populates the switcher. One entry hides it.
- Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) are handled — see
  [DATA-MODEL.md](DATA-MODEL.md#money).

> **Prices are not converted client-side.** The theme formats what the API sent
> it. If you offer multiple currencies, the API returns prices already in the
> requested one — a browser doing FX with a hardcoded rate will be wrong the day
> the rate moves, and wrong on an invoice is a refund.

### `commerce`

```json
{
  "commerce": {
    "freeShippingOver": 15000,
    "returnsWindowDays": 30,
    "shippingMethods": [
      { "id": "standard", "label": "Standard", "note": "2–4 working days", "price": 1200 }
    ],
    "countries": [["US", "United States"], ["IN", "India"]]
  }
}
```

`freeShippingOver` is **minor units**. It drives the progress bar in the cart and
drawer, the promise beside the buy button, *and the cart's own shipping
calculation* — editing it in admin changes all three together, which is the
whole point of it living here rather than in an environment variable.

`returnsWindowDays` appears in the trust block on the product page and in the
Shipping tab. `shippingMethods[0].price` is the standard rate the cart charges
below the threshold.

`countries` fills the country select at checkout and in the account's address
book. The states are not in this document: the forms ask `GET /countries/:code`
when the country changes and show a dropdown if it lists any — a store that ships
to fifty countries does not send fifty state lists with every page.

### `features`

```json
{
  "features": {
    "wishlist": true, "reviews": true, "search": true,
    "accounts": true, "discountCodes": true, "newsletter": true,
    "currencySwitcher": true
  }
}
```

Setting one to `false` removes its entry points — the heart on product cards,
the search field, the account icon, the discount field in the cart. Routes stay
reachable so an existing bookmark does not 404; nothing links to them.

There is no `currencySwitcher`. Multiple currencies are a backend negotiation —
the API returns prices already in the currency it was asked for — and a client
toggle that did FX with a hardcoded rate would be wrong the day the rate moved.
`pricing.currencies` is display metadata for a switcher you build against your
own backend.

### `navigation`

```json
{
  "navigation": {
    "primary": [
      { "label": "New", "to": "/shop?sort=newest" },
      { "label": "Shirts", "categorySlug": "shirts" },
      { "label": "Sale", "to": "/shop?tags=sale", "children": [
        { "slug": "shirts-linen", "name": "Linen shirts" }
      ]}
    ],
    "footer": [
      { "title": "Shop", "links": [{ "label": "All products", "to": "/shop" }] }
    ],
    "announcement": { "messages": ["Free shipping over $150"] }
  }
}
```

Three ways to build the menu, in order of how much control you want:

1. **`primary: []`** — the menu is generated from the category tree. One place to
   edit, and new categories appear automatically. Best for most stores.
2. **`categorySlug`** — you choose the labels and order, and each entry pulls
   that category's children in as a submenu. No restating the tree.
3. **`to` + `children`** — fully manual, for links that are not categories.

A submenu entry is either a category, `{ slug, name }`, linked to
`/shop/<slug>`, or a plain link, `{ label, to }`. A backend that lets a merchant
add sub-items by hand sends the second shape — the Odoo module does — and hand-added
children replace the ones a `categorySlug` would pull in.

`announcement: null` removes the strip above the header. Additional messages
after the first are hidden on small screens.

### `home`

The home page is an ordered array of typed sections. Reorder, retitle, remove
or duplicate freely.

```json
{
  "home": [
    { "type": "hero", "eyebrow": "Autumn 2026", "title": "Made to be kept.",
      "body": "…", "focal": "50% 35%",
      "image": { "url": "/images/editorial/hero.jpg", "alt": "…" },
      "actions": [{ "label": "Shop everything", "to": "/shop", "variant": "accent" }] },

    { "type": "category-strip", "title": "Shop by category",
      "ctaLabel": "All products", "ctaTo": "/shop",
      "source": { "parent": null, "limit": 6 } },

    { "type": "product-rail", "eyebrow": "Just landed", "title": "New this season",
      "ctaLabel": "See all", "ctaTo": "/shop?sort=newest",
      "source": { "sort": "newest", "limit": 4 } },

    { "type": "editorial", "eyebrow": "How we make things", "title": "…",
      "body": ["First paragraph.", "Second paragraph."],
      "image": { "url": "/images/editorial/craft.jpg", "alt": "…" },
      "action": { "label": "See more", "to": "/collections/built-to-last" } },

    { "type": "collection-grid", "title": "Collections", "source": { "limit": 3 } },

    { "type": "rich-text", "title": "…", "body": "…",
      "action": { "label": "…", "to": "/…" } },

    { "type": "promises" }
  ]
}
```

| Type | `source` accepts | Notes |
| --- | --- | --- |
| `hero` | — | `focal` is a CSS `object-position`, e.g. `"50% 30%"` |
| `category-strip` | `parent`, `limit` | `parent: "shirts"` shows that category's children |
| `product-rail` | `sort`, `category`, `collection`, `tags`, `limit` | Any `GET /products` filter |
| `editorial` | — | `body` is a string or an array of paragraphs |
| `collection-grid` | `limit` | |
| `rich-text` | — | Centred copy block |
| `promises` | — | Renders the `promises` array |

**A "New this season" rail is just a `product-rail` with `source.sort: "newest"`.**
Want a sale rail? `{ "type": "product-rail", "title": "Sale", "source": { "tags": ["sale"], "limit": 8 } }`.

An unrecognised `type` is skipped with a console warning in development. That is
deliberate: an admin panel emitting a section type newer than the deployed build
leaves a gap rather than taking the page down.

Adding a new type is one entry in the registry at the bottom of
`src/components/home/sections.jsx`.

### `recommendations`

```json
{
  "recommendations": {
    "strategy": "automatic",
    "limit": 4,
    "title": "You might also like",
    "inCart": { "enabled": true, "title": "Goes with this", "limit": 3, "strategy": "same-category" }
  }
}
```

| Strategy | How it picks | When to use |
| --- | --- | --- |
| `automatic` | Scored: shared leaf category `+3`, shared top-level `+2`, each shared tag `+2`, similar price `+1` | Default. Good without any curation |
| `same-category` | Same category, most-reviewed first | Small catalogues |
| `best-sellers` | Most-reviewed overall, ignores the current product | Very small catalogues |
| `manual` | Each product's `relatedSlugs`, in order | Full editorial control |
| `api` | `GET /products/:slug/related` — your logic | You have a recommender |
| `off` | Hides the section | |

Every strategy **tops up from best-sellers** if it cannot fill `limit`. An empty
rail looks broken; a slightly-off rail does not.

The `automatic` scoring weights a shared *leaf* category above a shared
top-level one on purpose — "another merino thing" is a better suggestion than
"another knit".

### `checkout`

```json
{
  "checkout": {
    "mode": "redirect",
    "createUrl": "https://pay.yourstore.com/sessions",
    "successUrl": "/order/:orderId",
    "cancelUrl": "/cart",
    "collectPhone": true,
    "requireAccount": false,
    "termsUrl": "/pages/shipping"
  }
}
```

`collectPhone: false` drops the phone field. `requireAccount: true` sends a
signed-out shopper to sign in first rather than failing at submit. `termsUrl`
renders an agreement line under the place-order button; omit it and the line
disappears.

Five modes. Full guide with provider examples: **[CHECKOUT.md](CHECKOUT.md)**.

| Mode | What happens |
| --- | --- |
| `demo` | Places a fake order through the bundled adapter. Previews only |
| `razorpay` | Opens Razorpay's modal over the page; your server creates the Razorpay order and verifies the signature |
| `redirect` | POSTs to `createUrl`, expects `{ url }`, sends the browser there. **Recommended for real stores** |
| `api` | POSTs to `createUrl`, expects an `Order` back. For invoicing, COD, wholesale terms |
| `payments` | The backend lists its own payment gateways and the shopper pays on the checkout page. For backends that integrate gateways, such as Odoo |

`createUrl` may be a full URL or a path on your API. `:cartId` is substituted.

### `seo`

```json
{
  "seo": {
    "siteUrl": "https://yourshop.com",
    "indexable": true,
    "disallow": ["/checkout", "/account", "/cart", "/orders/lookup", "/admin"],
    "aiCrawlers": "allow",
    "crawlers": { "GPTBot": true, "ClaudeBot": true, "CCBot": false },
    "sitemapImages": true
  }
}
```

`robots.txt` and `sitemap.xml` are **generated from these at build time**. They
used to be a static file, which made one of its lines a decision the theme had
taken on the merchant's behalf.

**`siteUrl` is the one setting with no sensible default.** A sitemap, a
canonical tag and an Open Graph image all need absolute URLs; a relative one is
ignored by every scraper that reads it.

`aiCrawlers` is policy, not engineering. Assistants increasingly answer "where
can I buy a linen shirt", and a shop they cannot read is not in the answer —
against which your photography and product copy end up in a training set. Both
positions are defensible, which is exactly why the theme does not hold one.

| Mode | Writes |
| --- | --- |
| `allow` | Nothing per-bot. An absent rule already means allowed |
| `block` | Every named bot refused, regardless of its own flag |
| `custom` | Each bot honoured separately |

`indexable: false` takes the whole shop out of every index — right for a staging
deployment, which otherwise competes with production for its own keywords.

`sitemapImages` puts all 112 product photographs in the sitemap. Google Images
is a shopping surface of its own and will not find pictures that exist only
inside a JavaScript-rendered gallery.

### `analytics`

```json
{ "analytics": { "enabled": false, "respectDoNotTrack": true, "debug": false } }
```

Events are pushed to `window.dataLayer` in GA4's ecommerce vocabulary —
`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `search`,
`add_to_wishlist`, `app_error`. A tag manager reads that array natively and
anything else can be pointed at it.

**No vendor script ships with the theme**, and that is the point. A store
already has GTM, or Plausible, or a self-hosted Umami; a theme that bundles a
competing one is something to rip out rather than something to configure.

The names follow GA4 rather than being invented, because a store's analytics
people already have reports built on them — calling it `product_viewed` means
rewriting every one.

| Key | Does |
| --- | --- |
| `enabled` | Off by default, so a theme cloned for a demo does not start collecting |
| `respectDoNotTrack` | Honours the header. One line, and it is what the header is for |
| `debug` | Logs every event to the console without sending it. For wiring things up |

Consent, if you gather it, goes through `setConsent(false)` until you have it.
Nobody having been asked is treated as allowed — a shop with no banner should
not silently record nothing.

### `notifications`

```json
{
  "notifications": {
    "enabled": true,
    "from": "orders@yourshop.com",
    "replyTo": "",
    "transport": "smtp",
    "smtp": { "host": "smtp.gmail.com", "port": 465, "secure": true, "user": "you@gmail.com" },
    "endpoint": "",
    "events": { "orderPlaced": true, "paymentCaptured": true, "shipped": true,
                "refunded": true, "cancelled": true }
  }
}
```

A store that takes money and sends nothing is broken, so this is not an optional
extra. It cannot run in the browser either — SMTP needs a socket — so the
storefront's whole job is to say *when* to send and the server's is to send it.

**There is no `smtp.password` and there never will be.** It goes to
`POST /admin/credentials`; see [CHECKOUT.md](CHECKOUT.md). For Gmail that is an
App Password, not your account password: Google refuses the latter, and an App
Password can be revoked on its own.

Turning an event off stops that message without touching the others — a store
that ships from a warehouse with its own tracking emails wants `shipped` off and
the rest on.

### `trust`

```json
{
  "trust": {
    "payments": ["Visa", "Mastercard", "Amex", "PayPal", "Apple Pay", "UPI"],
    "repairs": true,
    "showCertifications": true,
    "showFitFeedback": true,
    "showSocialProof": true,
    "socialProofThresholds": { "bought": 25, "saved": 20 },
    "assurances": [
      {
        "icon": "refresh",
        "label": "30-day returns, no reason needed",
        "note": "Unworn, tags attached. A prepaid label is in every parcel."
      },
      { "icon": "shield", "label": "Two-year seam and hardware guarantee" }
    ]
  }
}
```

Rendered inside the buy box, not in the footer — placement is most of the effect.
See [CRO.md](CRO.md).

| Key | Does |
| --- | --- |
| `payments` | Payment marks beside the secure-checkout line. Text labels, no logos to license |
| `repairs` | The "repaired, not replaced" line |
| `showFitFeedback` | The fit verdict and purchaser distribution |
| `showSocialProof` | Demand counts under the buy button |
| `socialProofThresholds` | Below these, the block renders **nothing** rather than advertising low demand |
| `assurances` | The services rows under the buy button, for every product that has none of its own |

`assurances` is a fallback, not a default that gets copied. A product with its
own `enrichment.assurances` replaces these outright rather than merging — a coat
with a ten-year structural guarantee should not also advertise the two-year one.
An **empty array on the product** means *this product has none* and hides the
block; **omitting the field** is what inherits these rows.

### `deliveryPolicy`

```json
{
  "deliveryPolicy": [
    "Standard shipping is {shipping}, free over {freeOver}. Orders placed before 2pm ship the same working day.",
    "Returns are free within {returnsDays} days, unworn and with tags attached.",
    "We repair anything we made. Send it back and we will quote before doing the work."
  ]
}
```

The "Delivery & returns" panel on every product page. It was three hardcoded
paragraphs in a component, which meant a store could change `returnsWindowDays`
in settings and go on promising something else in prose four lines below it.
Anything a shopper can read is configuration.

| Token | Filled from |
| --- | --- |
| `{shipping}` | `commerce.shippingMethods[0].price`, formatted in the store currency |
| `{freeOver}` | `commerce.freeShippingOver`, formatted |
| `{returnsDays}` | `commerce.returnsWindowDays` |

**An unknown token is left visible.** A `{typo}` on the page is findable; a
silently blanked one is not. An empty array renders no panel.

### `promises`

```json
{
  "promises": [
    { "icon": "truck", "title": "Free shipping over $150", "body": "Tracked, 2–4 days." }
  ]
}
```

Icon names come from the built-in set in `src/components/ui/Icon.jsx`:
`truck` `refresh` `shield` `package` `map-pin` `sparkle` `check` `info` `heart`
`bag` `user` `search` `star` `filter` `trash`.

An empty array removes the strip everywhere it appears.

---

## Categories and sub-categories

Categories are **not** part of the storefront document — they come from
`GET /categories`, because they are catalogue data rather than theme settings
and they carry product counts.

The source is flat with a `parent` pointer; the API returns a tree:

```json
{
  "items": [
    {
      "slug": "shirts", "name": "Shirts", "parent": null,
      "blurb": "Poplin, oxford, and one very good linen.",
      "image": { "url": "…", "alt": "Shirts" },
      "count": 4,
      "children": [
        { "slug": "shirts-linen", "name": "Linen", "parent": "shirts", "count": 1, "image": {} }
      ]
    }
  ],
  "total": 6
}
```

Rules that matter:

- **Flat with `parent` in storage, tree on read.** Nesting the source data makes
  every reparent a structural edit instead of one field.
- **A parent's `count` includes its descendants.** Otherwise `/shop/shirts`
  advertises 0 while its children have products.
- **Filtering by a parent must include descendants.** `/shop/shirts` returns
  everything under Oxford, Linen and Flannel. Products only need to list their
  leaf.
- Two levels are what the header renders. Deeper trees are returned intact and
  the extra levels appear on category pages, not in the menu — a three-deep
  hover menu is unusable on touch.

---

## Worked example: rebranding without touching code

```json
{
  "store": { "name": "ATLAS", "tagline": "Workwear that earns its keep.",
             "logo": { "imageUrl": "https://cdn.atlas.com/logo.svg", "height": 26 } },
  "pricing": { "currency": "INR", "locale": "en-IN" },
  "commerce": { "freeShippingOver": 500000 },
  "features": { "reviews": false, "wishlist": false },
  "navigation": { "primary": [], "announcement": { "messages": ["Free delivery across India"] } },
  "home": [
    { "type": "hero", "title": "Built for the site.", "image": { "url": "https://cdn.atlas.com/hero.jpg", "alt": "" } },
    { "type": "product-rail", "title": "Best sellers", "source": { "sort": "featured", "limit": 8 } },
    { "type": "promises" }
  ],
  "recommendations": { "strategy": "same-category", "limit": 4 },
  "checkout": { "mode": "redirect", "createUrl": "https://api.atlas.com/checkout/sessions" }
}
```

Different name, logo, currency, menu (generated from categories), home page,
recommendation strategy and payment provider. No rebuild.
