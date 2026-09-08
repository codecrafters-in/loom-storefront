# Admin panel and the write API

`/admin` is a working back office: products, inventory, categories, orders,
storefront settings, import and export.

It is also the reference implementation of the write API. Every endpoint
documented here has a screen driving it, so the contract is proven rather than
asserted.

```
npm run dev   →   http://localhost:5173/admin
```

## How it relates to the storefront

Both talk to the same `api` surface.

- **Mock mode** — writes go to a local database (`src/lib/db.js`, backed by
  `localStorage`). Edit a price in admin and the storefront shows it
  immediately, in that tab and in every other open tab. There is no publish
  step, because there is nothing to sync.
- **Api mode** — the same calls hit your `/admin/*` endpoints. The panel does
  not change.

That symmetry is the point. If the admin panel can drive your backend, so can
anything else.

## What it manages

| Screen | Does |
| --- | --- |
| Overview | Counts, low and out-of-stock, orders, revenue |
| Products | Search; click a row to open the full record |
| Product record | Five tabs: details, media, variants, fit and fabric, organise. Create and delete |
| Inventory | Every variant, filterable to low or out, adjust by delta |
| Categories | Tree with parents and children, create and re-parent |
| Size charts | Shared measurement tables |
| Orders | Status, tracking, cancellation with stock return |
| Discounts | Codes, percentage, fixed or free shipping |
| Storefront | Company profile, currency, features, recommendations, checkout, trust |
| Import / export | Whole-catalogue JSON, the shape the bulk endpoint takes |
| Developer docs | This documentation, rendered, with copy buttons |

### Derived on write, not stored

Three things the server computes rather than trusting a client to send:

- **`badges`** — `sale` from compare-at, `sold-out` and `low-stock` from the
  variants. A product that sells out in admin must turn over on the grid, which
  it will not do if badges were computed once at import.
- **`available`** — always `inventory > 0`.
- **Variant price** — a product price change cascades to every variant that was
  not individually overridden. Without it the grid shows the new price and the
  cart charges the old one, with nothing on screen to warn anyone.

### Drafts

`Product.published: false` hides a product from `GET /products`, from search,
from recommendations, and makes its own URL return 404. Admin still lists it.
This is what lets a season be staged before it opens.

---

## The write API

All routes are namespaced under `/admin` and require authentication. **These are
not public endpoints** — a storefront token must never be able to reach them.

### Products

```
GET    /admin/products?q=&page=1&per_page=25   → { items, total, page, perPage }
POST   /admin/products                          → Product
PATCH  /admin/products/:id                      → Product
DELETE /admin/products/:id                      → { ok: true }
```

`POST` and `PATCH` take a partial `Product`. Anything omitted is left alone,
which is what makes a price-only edit safe.

```json
PATCH /admin/products/prod_1
{ "price": { "amount": 17800, "currency": "USD" } }
```

> **A product price change must cascade to its variants** unless a variant has
> an explicit override. The admin editor does this; if your backend does not,
> you will sell at last month's price the moment anyone adds to cart.

### Inventory

```
PATCH /admin/variants/:variantId/inventory   { quantity }  → Variant   (set)
POST  /admin/variants/:variantId/inventory   { delta }     → Variant   (adjust)
```

**Prefer the delta.** Two people adjusting the same SKU with `set` silently
overwrite each other; with a delta both land. It is also the only shape that
survives a replayed webhook without double-counting — key on an operation id
and the retry is a no-op.

```json
POST /admin/variants/var_merino_oat_m/inventory
{ "delta": -1, "reason": "sale", "operationId": "evt_9f2c" }
```

`available` is derived from `inventory > 0` server-side, never sent by a client.

### Categories

```
POST   /admin/categories        { slug, name, parent, blurb } → Category
DELETE /admin/categories/:slug  → { ok: true }
```

Deleting a category **promotes its children to the deleted node's parent**
rather than orphaning them. A category tree with unreachable nodes is worse than
a flat one.

### Settings

```
PATCH /admin/storefront   → the storefront document
```

Deep-merged, except arrays which replace wholesale — see
[CONFIGURATION.md](CONFIGURATION.md#where-settings-come-from).

### Bulk

```
POST /admin/import
{
  "mode": "merge",
  "products": [ /* Product[] */ ],
  "categories": [ /* Category[] */ ],
  "collections": [ ],
  "settings": { }
}
→ { products: 24, categories: 20, collections: 3 }

GET /admin/export → the same shape
```

`mode: "merge"` upserts by slug and deletes nothing. `mode: "replace"` swaps the
whole set.

**This is the endpoint a nightly ERP dump should use.** A thousand individual
POSTs is a thousand transactions, a thousand cache purges and a rate limit you
will hit. One payload is one transaction and one purge.

For very large catalogues, chunk it — a few thousand products per request — and
make each chunk idempotent so a partial failure can be retried safely.

---

## Authentication

```
POST /admin/auth/login   { username, password } → { token }
```

The demo checks `VITE_ADMIN_USER` / `VITE_ADMIN_PASSWORD` — `admin` / `admin` by
default — entirely in the browser. Those are compiled into the bundle like every
`VITE_` variable, so they are public by construction. That is a demo affordance,
not a design; the customer sign-in at `POST /auth/login` is a separate thing with
a separate session.

For a real deployment:

1. **Separate the admin session from the storefront session.** A customer token
   must not carry admin scope. Different audience claim, ideally a different
   cookie domain.
2. **Authorise on the server, on every request.** Hiding `/admin` in the client
   hides nothing — the route is in the JavaScript bundle either way.
3. **Require a second factor.** Admin access is full catalogue and full order
   history.
4. **Rate-limit and log writes** with the actor, so "who dropped the price to
   zero at 3am" has an answer.

If you would rather not expose an admin surface at all, do not implement
`/admin/*`. Manage the catalogue in your existing system and push to the
storefront with the bulk endpoint and webhooks — the storefront never needs to
know an admin panel exists.

---

## Webhooks out

When something changes, tell the storefront so it can purge rather than wait for
a TTL:

```
POST https://your-store.example/api/revalidate
{ "type": "product.updated", "slug": "merino-crew-knit", "at": "2026-09-09T…" }
```

| Event | Purge |
| --- | --- |
| `product.updated` `product.deleted` | that product, `/products` lists, `/bootstrap` |
| `inventory.updated` | that product, `/products` lists |
| `category.updated` | `/categories`, `/products`, `/bootstrap` |
| `settings.updated` | `/storefront`, `/bootstrap` |
| `order.paid` `order.fulfilled` | that order |

Sign the payload and verify the signature. An unauthenticated revalidation
endpoint is a free cache-flush attack. Details in
[PERFORMANCE.md](PERFORMANCE.md#keeping-the-catalogue-fresh-without-polling).

---

## Data safety in the demo

`localStorage` holds a few megabytes and is per-browser. It is right for a demo
and wrong for a shop:

- Export before you experiment. **Import / export → Download JSON.**
- **Reset to demo data** discards everything and reseeds.
- Bumping `VERSION` in `src/lib/db.js` reseeds on next load. It does not
  migrate — this is demo data, and that is exactly why the file is demo-only.
