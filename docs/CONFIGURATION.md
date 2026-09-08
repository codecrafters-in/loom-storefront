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

`freeShippingOver` is **minor units** and drives the progress bar in the cart and
drawer. `shippingMethods` renders the delivery picker at checkout; the server
still decides what is actually charged.

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
the search field, the account icon. Routes stay reachable so an existing
bookmark does not 404; nothing links to them.

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
    "termsUrl": "/pages/terms"
  }
}
```

Three modes. Full guide with provider examples: **[CHECKOUT.md](CHECKOUT.md)**.

| Mode | What happens |
| --- | --- |
| `demo` | Places a fake order through the bundled adapter. Previews only |
| `redirect` | POSTs to `createUrl`, expects `{ url }`, sends the browser there. **Recommended for real stores** |
| `api` | POSTs to `createUrl`, expects an `Order` back. For invoicing, COD, wholesale terms |

`createUrl` may be a full URL or a path on your API. `:cartId` is substituted.

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
