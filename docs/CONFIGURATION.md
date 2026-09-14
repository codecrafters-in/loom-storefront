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

In `api` mode those two variables are ignored: the admin login page has a single
**Sign in with Odoo** button, and the password is typed on Odoo's own page. They
are compiled into the bundle like every `VITE_` variable, so they gate a
browser-local demo and nothing more — see [ADMIN.md](ADMIN.md#authentication).

**`VITE_API_TOKEN` is gone.** It was sent in place of the signed-in customer's
own token, so with it set a sign-in appeared to work and every account call then
answered for somebody else, or for nobody. Delete it from `.env.local` and from
your host's settings. A public catalogue needs no token, and customer and admin
sessions carry their own.

> **Vite inlines every `VITE_*` variable into the JavaScript bundle.** Anything
> here is readable by anyone who opens devtools. Publishable keys are fine;
> secret keys, database URLs and webhook signing secrets are not, ever.

Setting `VITE_DATA_SOURCE=api` without `VITE_API_BASE_URL` throws at boot with
a readable message rather than firing requests at `undefined`.

---

## Content-Security-Policy

`npm run build` ends with `scripts/csp.mjs`, which writes a
`<meta http-equiv="Content-Security-Policy">` into every HTML file in `dist/`.
It is a meta tag rather than a header because the policy depends on the build —
the API origin, and the hash of each page's inline scripts, which are the data
the prerenderer seeds — while `vercel.json` and `public/_headers` are static
files. The one directive a meta tag cannot carry, `frame-ancestors 'none'`, is a
real header in both, next to `X-Frame-Options: DENY`: nobody may frame the shop.

| Directive | Allows |
| --- | --- |
| `default-src` | `'self'` |
| `script-src` | `'self'`, the SHA-256 of each inline script on that page, Razorpay Checkout, Cloudflare Turnstile, Google reCAPTCHA. No `'unsafe-inline'`, no `'unsafe-eval'` |
| `connect-src` | `'self'`, the API origin, Razorpay |
| `img-src`, `media-src` | `'self'`, `data:`, `blob:`, any `https:` origin, and the API origin — so an Odoo on plain `http://localhost:8069` still shows its images |
| `style-src` | `'self'`, inline styles, Google Fonts |
| `font-src` | `'self'`, `data:`, Google Fonts |
| `frame-src` | Razorpay, Turnstile, reCAPTCHA |
| Analytics and ad tags | `script-src` and `connect-src` also allow Google Tag Manager and Analytics, Meta, TikTok and Pinterest, so a tag the merchant switches on is not refused. They load only when named in `analytics.providers` |
| `form-action` | `'self'` and the API origin |
| `base-uri`, `object-src` | `'self'`, `'none'` |

**A live store** (`VITE_DATA_SOURCE=api`) renders pages on request, so there are no HTML files to write a meta tag
into: the render handler (`server/handler.mjs`) sends the same policy as a `Content-Security-Policy` header with each
page, with the hash of that page's data script and `frame-ancestors 'none'` ([Deploying](DEPLOY.md)).

The API origin is read from `VITE_DATA_SOURCE` and `VITE_API_BASE_URL` the way
Vite reads them — the environment first, then the `.env` files — so it is always
the backend the bundle calls. The dev server sends no policy; check a change with
`npm run build` and `npx vite preview`.

**Adding a domain.** A script, an iframe or an API call to a new third party — an
analytics tag, a chat widget, another payment gateway — is refused until it is
listed. Add it to `THIRD_PARTY` in `scripts/lib/csp.mjs` and rebuild. The browser
console names the directive that refused it ("Refused to load the script … because
it violates the following Content Security Policy directive: script-src …"), and
that is the list to add it to. Never add `'unsafe-inline'` or `'unsafe-eval'` to
`script-src` to make something work: that switches the policy off for exactly the
attack it is there to stop.

If your host or CDN sends its own `Content-Security-Policy` header, the browser
enforces both, so a page is allowed only what both allow.

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
      { "code": "USD", "label": "US Dollar", "symbol": "$", "decimals": 2, "position": "before" },
      { "code": "INR", "label": "Indian Rupee", "symbol": "₹", "decimals": 2, "position": "before" }
    ],
    "showTaxNote": true,
    "taxNote": "Tax calculated at checkout."
  }
}
```

`showTaxNote` renders `taxNote` under the cart totals.

- `currency` is the display default and what `Intl.NumberFormat` formats with.
- `currencies` populates the currency switcher in the header (live stores only). One entry, or entries without a
  `pricelistId`, hides it. Picking one sends that `pricelistId` as the `X-Loom-Pricelist` header on every call, moves
  the bag (`POST /carts/:id/pricelist`) and reloads, so prices come back from the backend in that currency.
- `decimals` is how many decimals amounts of that currency have (3 for KWD, 0 for JPY); the Odoo backend sends it
  and every price, the price filter and analytics use it. Without it zero- and three-decimal currencies are still
  known — see [DATA-MODEL.md](DATA-MODEL.md#money). `position` is informational: prices are laid out by
  `Intl.NumberFormat` for the store's `locale`, which places the symbol the way shoppers there expect.

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
below the threshold. A method may also say `"pickup": true` (collected from a shop: checkout lists the shops) or
`"slots": true` (checkout asks for a delivery slot); the Odoo backend sets both from the store's delivery methods, and
the demo never does.

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

### `i18n`

```json
{
  "i18n": {
    "languages": [
      { "code": "en_US", "urlCode": "en", "name": "English (US)", "direction": "ltr" },
      { "code": "ar_001", "urlCode": "ar", "name": "العربية", "direction": "rtl" }
    ],
    "default": "en",
    "current": "en"
  },
  "uiStrings": { "fr": { "Add to bag": "Ajouter au panier" } }
}
```

The storefront's own text is in `src/i18n`: English is the source and the key, and `src/i18n/catalogs/<code>.js`
holds French, Spanish, German, Italian, Portuguese, Dutch, Arabic and Hindi (machine drafts; have them reviewed).

- An address starting with a language code (`/fr/shop`) shows that language: its catalog loads first, every API call
  sends `X-Loom-Lang: fr`, and `<html lang dir>` follow it (Arabic is right to left).
- Without one, the store's `default` language is shown, for the storefront's text as for the backend's content.
- `languages` lists what the Odoo website offers; the language switcher links between them.
- `uiStrings` (optional, per language) replaces any of the storefront's text with the merchant's own wording.
- A right-to-left language (`direction: "rtl"`, e.g. Arabic) sets `dir="rtl"`: spacing and alignment use logical
  utilities (`ms-`, `pe-`, `text-start`), the menu and bag drawers slide in from the other side, and arrows that follow
  reading order are mirrored (`rtl:-scale-x-100`).
- Addresses handed to a payment page keep the language (`/fr/order/…`), so the shopper comes back in it.
- `node scripts/i18n-extract.mjs` lists the translatable text in `src/i18n/source.json` and prints each catalog's
  coverage; `--missing fr` prints what French lacks.

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

`termsRequired: true` replaces the agreement line with a checkbox the shopper must tick (sent as `acceptTerms`), and
hides Apple Pay and Google Pay; `termsVersion` is informational. `minimumOrder` (minor units) is the store's minimum;
the bag's own `minimumOrder.remaining` decides whether checkout is offered. `orderNote` and `giftMessage` show optional
boxes, and `giftWrap: { price }` a "Gift wrap this order" checkbox. The Odoo backend sends all of them from the store.

`collectPhone: false` drops the phone field; `phoneRequired: true` makes it
required (the Odoo backend sends the store's setting), and `false` labels it optional. `requireAccount: true` sends a
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
    "sitemapImages": true,
    "title": "Loom | Considered clothing",
    "description": "Clothing made to be kept.",
    "titleTemplate": "{title} | {store}",
    "image": "https://…/og.jpg"
  }
}
```

**On a live store** the backend's `robots.txt` and sitemaps are served on the storefront's domain by the render handler
([Deploying](DEPLOY.md)), and `title`, `description` and `image` are the home page's head; `titleTemplate` names pages
that have no `seo` block of their own ([API](API.md#search-engines)). **In the demo** `robots.txt` and `sitemap.xml`
are **generated from these at build time**. They used to be a static file, which made one of its lines a decision the
theme had taken on the merchant's behalf.

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
{
  "analytics": {
    "enabled": false, "respectDoNotTrack": true, "debug": false,
    "providers": { "ga4": "G-A1B2C3D4E5", "gtm": "GTM-A1B2C3D", "metaPixel": "123456789012345", "tiktok": "C4A1…", "pinterest": "2612345678901" },
    "serverPurchase": { "ga4": true, "meta": false }
  }
}
```

Events are pushed to `window.dataLayer` in GA4's ecommerce vocabulary —
`page_view`, `view_item_list`, `select_item`, `view_item`, `add_to_wishlist`,
`add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`,
`add_shipping_info`, `add_payment_info`, `purchase`, `search`, `app_error`. A tag
manager reads that array natively and anything else can be pointed at it.

**No vendor script ships with the theme.** A store already has GTM, or
Plausible, or a self-hosted Umami; a theme that bundles a competing one is
something to rip out rather than something to configure. When the backend names
tags in `providers` (Odoo: the store's analytics IDs), the theme loads those and
nothing else (`src/lib/tags.js`, its own chunk): Google Analytics 4 and Tag
Manager count as **analytics**, Meta Pixel, TikTok Pixel and Pinterest Tag as
**marketing**, and with a consent banner each waits for its category. The same
events reach them in each platform's words (Meta `ViewContent`, `AddToCart`,
`InitiateCheckout`, `Purchase`…); a purchase carries the order number as its
event ID, so a purchase also reported by the server (`serverPurchase`) counts
once. Leave GA4 empty when Tag Manager already sends to Google Analytics, or
purchases count twice.

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

### `media`

```json
{ "media": { "imageUrlTemplate": "https://shop.example.com/cdn-cgi/image/width={width},format=auto/{url}" } }
```

Optional. Images the backend sends with sizes (`srcset`) are requested through this image CDN, which resizes them and
converts them to WebP or AVIF: `{url}` is the image's address and `{width}` the width wanted. Only an `https://`
template containing `{url}` is used; bundled photographs are left alone.

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

### `security`

```json
{
  "security": {
    "captcha": { "provider": "turnstile", "siteKey": "0x4AAAAAAA…", "actions": ["login", "register", "lookup", "newsletter"] }
  }
}
```

Filled in by the backend rather than edited here: the Odoo module sets it when a
store switches captcha on. `captcha` is `null` when it is off, and then no
captcha script is ever requested. `provider` is `turnstile` (Cloudflare) or
`recaptcha` (Google reCAPTCHA v3, invisible). `actions` lists the forms that send
a token; with no list, all four do. The site key is public by design — the secret
stays on the server. The demo never loads a captcha. Wire format in
[API.md](API.md#captcha).

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
