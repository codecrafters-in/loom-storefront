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
| Change colours, fonts, the logo | **[THEMING.md](THEMING.md)** |
| Wire it to Odoo, Shopify, Medusa, WooCommerce | **[RECIPES.md](RECIPES.md)** |
| Hand the whole spec to an AI and have it build the backend | **[INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md)** |
| Understand the trust and conversion elements | **[CRO.md](CRO.md)** |
| Understand an error you are seeing | **[ERRORS.md](ERRORS.md)** |

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

No database, no API key, no account. Twenty-four products, working cart,
checkout and account, all in the browser.

## How it fits together

```
                    ┌──────────────────────────────┐
   components  ───► │  src/lib/api/index.js        │  one interface
   and pages        │  (asserts both adapters match)│
                    └───────────┬──────────────────┘
                                │  VITE_DATA_SOURCE
                    ┌───────────┴───────────┐
                    ▼                       ▼
            mock.js                     http.js
      bundled catalogue            fetch → your server
      + localStorage               + response validation
```

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
