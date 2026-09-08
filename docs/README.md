# LOOM documentation

A clothing storefront that runs on bundled demo data out of the box and on your
own backend by changing one environment variable.

## Start here

| If you want to… | Read |
| --- | --- |
| Run it locally and look around | [Quick start](#quick-start) below |
| Change the store name, menu, home page, currency | **[CONFIGURATION.md](CONFIGURATION.md)** |
| Connect your own backend | **[API.md](API.md)** |
| Take real payments | **[CHECKOUT.md](CHECKOUT.md)** |
| Know the exact shape of every object | **[DATA-MODEL.md](DATA-MODEL.md)** |
| Build your own database behind it | **[DATABASE.md](DATABASE.md)** |
| Change colours, fonts, the logo | **[THEMING.md](THEMING.md)** |
| Wire it to Odoo, Shopify, Medusa, WooCommerce | **[RECIPES.md](RECIPES.md)** |
| Hand the whole spec to an AI and have it build the backend | **[INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md)** |
| Have an AI design the database | **[SCHEMA-PROMPT.md](SCHEMA-PROMPT.md)** |
| Understand the trust and conversion elements | **[CRO.md](CRO.md)** |
| Run the back office, or build the write API | **[ADMIN.md](ADMIN.md)** |
| Serve real traffic without melting | **[PERFORMANCE.md](PERFORMANCE.md)** |
| Hand it to a merchant | **[USER-GUIDE.md](USER-GUIDE.md)** |
| Understand an error you are seeing | **[ERRORS.md](ERRORS.md)** |

## Three ways to run it

| Mode | Database | Backend | Use when |
| --- | --- | --- | --- |
| `mock` | None — browser storage | None | Demos, design review, the public preview |
| `api` | Someone else's | Odoo, Shopify, Medusa, WooCommerce | You already have a system of record |
| `api` + your own | [This schema](DATABASE.md) | You build it, from the prompts | You are building the commerce backend too |

One environment variable moves between them. Nothing above `src/lib/api/` knows
which is running.

The documentation is also served **inside the product**, at `/admin/docs` — the
same files, rendered, with copy buttons on every prompt and code block.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

No database, no API key, no account. Twenty-four products, working cart,
checkout and account, all in the browser.

The back office is at **`/admin`** — demo credential `admin` / `admin`.

## How it fits together

```
  storefront ─┐
              ├─► src/lib/api/index.js ─► cache + dedupe + SWR
  /admin  ────┘        (one interface)          │
                                                │  VITE_DATA_SOURCE
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                                mock.js                  http.js
                          local database            fetch → your server
                          (src/lib/db.js)          + response validation
```

The admin panel and the storefront use the same interface, so an edit in one is
visible in the other with no publish step. Reads pass through a cache that
de-duplicates in-flight requests and serves stale-while-revalidating; writes
purge only the namespaces they could have touched.

Nothing above `src/lib/api/` knows which adapter is running. That is the whole
design: build and demo against the mock, then point it at production without
touching a component.

Alongside the data adapters sits a **configuration document**
(`GET /storefront`) that drives identity, navigation, the home page,
recommendations, currency and checkout. Between the two, almost everything a
merchant would want to change is data rather than code — which is what makes an
admin panel possible later without a rewrite now.

## What is configurable without touching code

| Thing | Where |
| --- | --- |
| Store name, tagline, logo | `store` |
| Currency, locale, currency switcher | `pricing` |
| Free-shipping threshold, shipping methods, countries | `commerce` |
| Wishlist / reviews / search / accounts / newsletter on or off | `features` |
| Header menu, submenus, footer columns, announcement bar | `navigation` |
| The entire home page, as ordered typed sections | `home` |
| Categories and sub-categories | `GET /categories` |
| Fit, fabric, size chart, certifications | `Product.fit` / `.fabric` / `.sizeChart` |
| Payment marks, trust toggles, honest-scarcity thresholds | `trust` |

All of it is editable at **`/admin`**, which is also the reference
implementation of the write API — see [ADMIN.md](ADMIN.md).
| "You might also like" strategy | `recommendations` |
| Checkout mode and payment endpoint | `checkout` |
| The reassurance strip | `promises` |

Full reference: **[CONFIGURATION.md](CONFIGURATION.md)**.

## Project layout

```
src/
  lib/
    api/index.js       the switch; asserts both adapters expose the same surface
    api/mock.js        bundled backend — catalogue, cart, orders, auth
    api/http.js        real backend — fetch, auth, response validation
    api/contracts.js   types and boundary validation
    config.js          every environment variable, resolved once
    money.js           integer minor units, formatting, discounts
    checkout.js        demo / redirect / api checkout modes
  data/
    catalog.js         demo products and categories (mock mode only)
    storefront.js      default configuration document
  store/               storefront, cart, wishlist, auth, toasts
  components/
    home/sections.jsx  the home page section registry
    ui/ product/ cart/ layout/ shop/
  pages/               one file per route
scripts/
  images.mjs           fetch, crop and grade photography; pins ids in a lockfile
  brand.mjs            favicons, app icons, OG card, manifest, robots
  sitemap.mjs          sitemap.xml
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Brand assets → production build → sitemap |
| `npm run preview` | Serve the build |
| `npm run lint` | ESLint |
| `npm run images` | Fetch any missing photography |
| `npm run images:force` | Re-roll every image |
| `npm run brand` | Regenerate favicons, icons, OG card |
