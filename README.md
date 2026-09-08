# LOOM — a clothing storefront theme

A complete, production-shaped e-commerce front end. It runs on a bundled
catalogue out of the box, and on your own backend by changing one environment
variable.

Built by [CodeCrafters](https://codecrafters.in). MIT licensed — fork it, rebrand
it, ship it.

```bash
npm install
npm run dev          # http://localhost:5173
```

No database, no API key, no account. The demo store works immediately.

---

## The idea

Most storefront themes are either a static template you have to gut before it
can hold real data, or a full platform you have to adopt wholesale. This is
neither. It is a real storefront — filters, variants, stock, cart, discounts,
checkout, orders, addresses — talking to **one documented interface** with two
implementations behind it.

```
VITE_DATA_SOURCE=mock   →  src/lib/api/mock.js   (bundled catalogue, localStorage)
VITE_DATA_SOURCE=api    →  src/lib/api/http.js   (fetch against your server)
```

Nothing above `src/lib/api/` knows which one is running. Design against the mock,
demo it to a client, then point it at a real backend without touching a
component.

**[docs/API.md](docs/API.md) is the whole specification.** If your server answers
those routes with those shapes, this works.

---

## Pages

| Route | What it is |
| --- | --- |
| `/` | Home — hero, categories, new in, editorial, collections, bestsellers |
| `/shop` · `/shop/:category` | Catalogue with faceted filters, sort and pagination |
| `/collections/:slug` | A curated set, same grid |
| `/product/:slug` | Gallery, colour and size pickers with per-variant stock, tabs, reviews, related |
| `/search?q=` | Free-text search |
| `/cart` | Full bag, quantity, discount codes, free-shipping progress |
| `/wishlist` | Saved items |
| `/checkout` | Contact, address, delivery method, order summary |
| `/order/:id` | Confirmation and receipt |
| `/account` | Profile, orders, addresses |
| `/login` | Sign in and register |
| `/pages/:slug` | Size guide, shipping, care, contact |
| `*` | 404 |

Plus a slide-in cart drawer, a mobile filter sheet, and toasts.

---

## Configuration

```bash
cp .env.example .env.local
```

| Variable | Default | What it does |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `mock` | `mock` or `api` |
| `VITE_API_BASE_URL` | — | Required when `api`. No trailing slash |
| `VITE_API_TOKEN` | — | Sent as `Authorization: Bearer`. Publishable keys only |
| `VITE_API_TIMEOUT` | `12000` | Request timeout in ms |
| `VITE_STORE_NAME` | `LOOM` | Wordmark and page titles |
| `VITE_CURRENCY` | `USD` | ISO 4217 |
| `VITE_LOCALE` | `en-US` | Number and date formatting |
| `VITE_FREE_SHIPPING_OVER` | `150` | Threshold, in major units |
| `VITE_REPO_URL` | this repo | Footer source link |

> Vite inlines every `VITE_*` variable into the shipped bundle. Anything here is
> public. Never put a secret key in one.

Switching to a real backend:

```bash
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=https://api.yourstore.com/v1
```

The app fails at boot with a readable message if `api` is set without a base
URL, rather than silently making requests to `undefined`.

---

## Things worth knowing before you fork it

**Money is integer minor units.** `{ amount: 12800, currency: "USD" }` is
$128.00. Never a float — `0.1 + 0.2 !== 0.3`, and a cart that adds up in floats
is eventually a cent out on a real invoice. `src/lib/money.js` handles
formatting and zero-decimal currencies.

**The cart is owned by the server.** Every mutation returns the whole repriced
cart and the client replaces state wholesale. Discounts, shipping thresholds and
tax are server concerns; a client that recomputes them will disagree with the
invoice sooner or later.

**Facets come from the API, over the whole category.** Deriving them from the
visible results is the classic catalogue bug: filter to one colour and every
other colour vanishes from the panel.

**Responses are validated at the boundary.** A 200 with a missing `price` throws
a `ContractError` naming the endpoint and the field. A wrong shape that passes
silently surfaces three components later as a null dereference and costs you an
afternoon.

**Checkout stops before payment, deliberately.** Card details must never touch a
storefront theme — it drags your entire frontend into PCI scope. Hand off to
Stripe Elements, Razorpay or Adyen and create the order server-side on the
payment webhook.

**Filter state lives in the URL.** Shareable, bookmarkable, and survives the back
button. None of which you get from `useState`.

**Requests are generation-guarded.** Change a filter twice quickly and the slow
first response cannot overwrite the fast second one.

---

## Photography

`npm run images` fetches every image from Unsplash, crops it to the right
aspect, grades it to a common exposure so twenty-four unrelated photos read as
one lookbook, and pins the chosen photo ids in `scripts/images.lock.json` so the
same commit always builds the same store.

```bash
npm run images         # fetch anything missing
npm run images:force   # re-roll everything
```

Credits are written to `public/images/CREDITS.md`. Replace the whole folder with
real product photography when you have it — the shapes are 4:5 for products and
categories, 3:2 for collections, 16:9 for the hero.

---

## Structure

```
src/
  lib/
    api/
      index.js       the switch — asserts both adapters match
      mock.js        bundled backend
      http.js        real backend
      contracts.js   types + boundary validation
    config.js        every env var, resolved once
    money.js         minor units, formatting, discounts
  data/catalog.js    the demo catalogue (mock mode only)
  store/             cart, wishlist, auth, toasts
  components/        ui/ product/ cart/ layout/ shop/
  pages/             one file per route
```

Re-skinning is one block: the CSS custom properties at the top of
`src/index.css`. Every component reads tokens, never literals, so changing the
palette changes the whole store.

---

## Deploying

Static output — anything that serves files will do.

```bash
npm run build        # → dist/
npm run preview
```

Client-side routing needs a rewrite so deep links do not 404:

- **Vercel** — add `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }` to `vercel.json`
- **Netlify** — `/*  /index.html  200` in `public/_redirects`
- **nginx** — `try_files $uri $uri/ /index.html;`

---

## Licence

MIT. No attribution required, though a link back is appreciated.
