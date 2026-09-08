# Performance and scale

A storefront that calls another system on every page view inherits that
system's latency, its rate limits and its outages. This is how the theme avoids
that.

## The four layers

| Layer | What it holds | Where |
| --- | --- | --- |
| Bootstrap | Settings, categories, collections, home rails — one request | `GET /bootstrap` |
| Cache | Read responses, stale-while-revalidate | `src/lib/api/cache.js` |
| De-duplication | Identical in-flight requests joined, not repeated | same file |
| Invalidation | Writes purge only the namespaces they could have touched | `src/lib/api/index.js` |

Result on a cold home page: **one request**, not five. On a warm one: zero.

---

## 1. One request for the first screen

The home page needs settings, the category tree, collections and two product
rails. Fetched separately that is five sequential round trips before anything
is readable — and on a real backend each is its own connection, auth check and
query plan.

`GET /bootstrap` returns them together:

```json
{
  "storefront": { },
  "categories": [ ],
  "collections": { "items": [], "total": 3 },
  "rails": { "{\"sort\":\"newest\",…}": [ /* products */ ] },
  "generatedAt": "2026-09-09T10:14:00.000Z"
}
```

`rails` is keyed by a stable hash of each home section's `source`, computed by
the same function on both sides (`src/lib/api/railKey.js`). Two sections with
identical sources share one entry rather than being fetched twice.

**It is optional.** If the endpoint 404s the theme falls back to the individual
calls, so you can add it whenever. Nothing breaks without it.

**Cache it hard.** The payload changes when a merchant saves settings or the
catalogue moves — not per request, and never per user. It contains nothing
personal, so it is safe on a CDN:

```
Cache-Control: public, max-age=60, stale-while-revalidate=600
```

That single header is worth more than every optimisation below it.

---

## 2. Stale-while-revalidate

Cached responses are served instantly and refreshed in the background. Going
shop → product → back does not re-fetch a catalogue that has not changed, and
the screen never blanks for data it already had.

| Namespace | TTL | Why |
| --- | --- | --- |
| `bootstrap` | 5 min | Changes on a settings save |
| `storefront` | 10 min | Same |
| `catalog`, `product` | 5 min | Price and stock move; five minutes is the honest ceiling |
| `reviews` | 10 min | Slow-moving |
| cart, orders, account | **never** | Per-user and change on every action |

Entries also persist in `sessionStorage`, so a reload or a restored tab starts
warm rather than cold.

> Cart and account are deliberately absent from that table. A cached bag is how
> a shopper ends up looking at someone else's, and it is the reason those
> responses must also carry `Cache-Control: private, no-store` from your server.

## 3. Request de-duplication

A home page with two rails and a header that all want the category tree fires
the same GET three times. Under load that is three times the database work for
one page view.

Any call already in flight for the same key is joined. Verified: five parallel
`listCategories()` calls resolve in one latency window.

## 4. Invalidation that is not a sledgehammer

Every write declares which read namespaces it could have invalidated:

```js
adminSetInventory: ['listProducts', 'getProduct', 'getBootstrap', 'adminListProducts']
adminUpdateSettings: ['getStorefront', 'getBootstrap']
adminImport: null   // null = purge everything
```

Adjusting stock does not throw away the category tree. Clearing everything on
every write is the common shortcut and it turns a cache into a slow, cold map.

---

## Pagination

**Offset pagination is the default and it degrades.** `?page=200&per_page=12`
makes the database count and discard 2,388 rows to return twelve, and an insert
between page loads shifts every row so an item can be seen twice or missed.

For catalogues under a few thousand products it is fine, and it is what the
theme's numbered pager uses.

Above that, support cursors as well:

```
GET /products?limit=24&cursor=eyJpZCI6InByb2RfMTIzIn0
→ { items: [], total: 4820, nextCursor: "eyJpZCI6InByb2RfMTQ3In0" }
```

Both can coexist — return `nextCursor` alongside `page`. The theme uses
whichever it is given.

Caps that matter:

- **Clamp `per_page` server-side.** A client asking for 10,000 is either a bug
  or a scraper. 48 is a sensible ceiling; the theme never asks for more than
  200, and only from admin.
- **Return `total` from an estimate above a few hundred thousand rows.** An
  exact `COUNT(*)` on a large filtered set is often slower than the query it
  belongs to. `PostgreSQL`'s `reltuples` or a cached count is enough for a
  pager.

---

## Keeping the catalogue fresh without polling

Do not poll. Push.

```
POST https://your-store.example/api/revalidate
{ "type": "product.updated", "slug": "merino-crew-knit" }
```

Your ERP or PIM calls this on change; the endpoint purges the CDN entry for
that product and the bootstrap. This is the pattern behind every fast headless
storefront — the catalogue is served from cache and the cache is corrected by
events, not by expiry.

The theme's write API already emits the right shape from admin. For an external
system, the useful events are:

| Event | Purge |
| --- | --- |
| `product.updated` `product.deleted` | that product, `/products` lists, `/bootstrap` |
| `inventory.updated` | that product, `/products` lists |
| `category.updated` | `/categories`, `/products` lists, `/bootstrap` |
| `settings.updated` | `/storefront`, `/bootstrap` |

Sign the payload and verify it. An unauthenticated revalidation endpoint is a
free cache-flush attack.

---

## Static snapshot mode

For the very fastest option, build the catalogue into the deploy:

1. At build time, fetch `/bootstrap` and `/products?per_page=all` and write them
   to `public/snapshot.json`.
2. Serve reads from that file; call the API only for cart, checkout and account.
3. Rebuild on the webhooks above.

Browsing then costs **zero** API calls and survives your backend being down.
The trade is stock accuracy, so re-check inventory at add-to-cart and again at
checkout — which a correct implementation does anyway.

---

## What the theme already does

- **Route-level code splitting.** Cart, checkout, account, admin and the content
  pages are separate chunks. A shopper never downloads the admin panel.
- **The demo catalogue is its own chunk**, loaded only in mock mode. In api mode
  it is 34KB that never leaves the server.
- **Fixed aspect ratios on every image container**, so the grid does not reflow
  as images decode — the main source of layout shift on a catalogue page.
- **`loading="lazy"` below the fold, `fetchPriority="high"` on the hero and the
  product's first shot.**
- **Generation-guarded requests.** Change a filter twice quickly and the slow
  first response cannot overwrite the fast second one.
- **Filter state in the URL**, so the back button is a cache hit rather than a
  refetch.

## Checklist before real traffic

- [ ] `/bootstrap` implemented and cached at the CDN
- [ ] `Cache-Control: public, max-age=60, stale-while-revalidate=600` on catalogue reads
- [ ] `Cache-Control: private, no-store` on cart, orders and `/me`
- [ ] `per_page` clamped server-side
- [ ] Cursor pagination above a few thousand products
- [ ] Webhook revalidation instead of short TTLs
- [ ] Images on a CDN with `width`/`height` in the response
- [ ] Inventory re-checked at checkout, not trusted from the cart
