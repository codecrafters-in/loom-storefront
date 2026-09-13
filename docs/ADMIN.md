# Admin panel and the write API

`/admin` is a working back office: products, inventory, categories, orders,
storefront settings, import and export.

It is also the reference implementation of the write API. Every endpoint
documented here has a screen driving it, so the contract is proven rather than
asserted.

```
npm run dev   →   http://localhost:5173/admin
```


## Two tabs open

Keep the admin in one tab and the shop in another — the shop follows along.

The demo backend is localStorage, which is shared between tabs, and the browser
announces a write to *the other* tabs with a `storage` event. Adopting that data
was never the hard half; the hard half is that the layers above it do not know
they have gone stale. So a foreign write does two more things:

- **The read cache is dropped.** A local write knows exactly which namespaces it
  invalidated and purges those (`PURGES` in `src/lib/api/index.js`). A write
  from another tab arrives as an opaque blob and nothing here knows what it
  touched, so the honest response is to assume the catalogue is stale.
- **Mounted pages are woken.** Emptying a cache only helps the *next* call, and
  a shop page sitting open makes no next call. Every `useAsync` re-reads
  silently, so a correction never flashes a skeleton over content someone is
  reading.

The same applies to the bag, saved items and the session: adding to the bag,
filling a heart or signing out in one tab reaches the others. Signing out is the
one worth calling out — a tab still showing an account menu, an order history
and a saved address for somebody who has left is the disclosure that order
scoping was fixed to prevent, arriving through a different door.

In `api` mode none of these keys exist, no event ever names them, and every
subscription is inert. Cart and session are the server's business then.

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
| Product record | Six tabs: details, media, variants, fit and fabric, highlights and specs, organise. Create and delete |
| Inventory | Every variant, filterable to low or out, adjust by delta |
| Categories | Tree with parents and children, create and re-parent |
| Size charts | Shared measurement tables |
| Orders | To ship, awaiting payment, shipped, delivered; ship with tracking, mark delivered, record cash, cancel with stock return |
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

### Unsaved work

The product editor keeps what you type in this browser — `localStorage`, under
`loom.admin.draft.<id>` (`new` for a product not saved yet) — until the product
is saved, deleted or the changes are discarded. Reload the tab, let a dev server
reload it after a code change, or crash the browser, and the record reopens with
a bar: *Unsaved changes from … were restored. Save to keep them.* **Discard them**
goes back to what the backend has. Drafts older than seven days are ignored.

It stays local on purpose: nothing reaches the backend or a shopper until
**Save**, and nobody else sees a half-edited record.

### What the editor checks before it saves

- **Slug.** Lowercase words joined by single dashes. Against a real backend it
  cannot end in a number — `levis-501-jeans`, not `levis-jeans-501` — because Odoo
  reads a trailing number as a record id. The field keeps a trailing dash while
  you type and tidies it when you leave the field.
- **Highlights and specifications are one value.** Editing a highlight updates the
  specification row with the same key, and the other way round, so the untouched
  copy can never be saved over the edit.
- **Number attributes.** An attribute the backend types as a number (Recycled
  content in %, Weight in gsm, Length in cm) shows *Number in %* as its
  placeholder, and a warning under a value with no digits in it.
- **Media.** Against a real backend only uploads are offered — JPEG, PNG, WebP or
  GIF; there is no paste-a-URL box and no video.
- **Variants.** Editing colours or sizes leaves any other option (a Length, say)
  alone; removing a value removes its variant rows; size-only and colour-only
  products can add rows.
- **A failed save opens the tab to fix** — slug on Details; specifications,
  features and assurances on Highlights & specs; composition, country and size
  chart on Fit & fabric; variants, variant prices and stock on Variants; images on
  Media — with the server's message in a toast. The draft is kept.

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

### Editing against a real backend

The editor sends the **whole product** back on every save, so the round trip is
the contract. The LOOM Odoo module follows these rules, and any backend should:

| Rule | Why |
| --- | --- |
| `GET /admin/products/:id` returns stored values: price and compare-at before pricelists and tax, every tag including hidden ones, fit and fabric even where a category hides them, and the product's own `sizeChartId` rather than an inherited one | Anything shown adjusted is written back adjusted, and drifts a little on every save |
| `fit: null` and `fabric: null` leave those blocks unchanged | A hidden block is not a request to delete it |
| Saving an unchanged record changes nothing but its update time | Save is the only way out of the editor |
| A description whose plain text did not change is not rewritten | Formatting added in the backend's own editor survives |
| Hidden tags are kept when the visible ones are replaced | The editor never saw them |
| Blank rows — an empty *Comes with* row, feature card or composition line — are skipped | *Add row* leaves one behind until it is filled in |
| A row with text but no label is refused, naming it: `"Comes with" row 2 has a note but no label.` | That one is a real mistake |
| Countries accept ISO codes, names, `UK`, `USA`, `Holland` and a leading `Made in` | Typing "UK" should not fail a save |
| Specification keys are normalised: `Neck type`, `neck-type` and `neck` are one key | Three spellings of one attribute is a filter that finds nothing |
| Of `badges`, only `new` and `bestseller` are read; `sale`, `sold-out` and `low-stock` are derived | See *Derived on write* above |
| New products track stock. A variant that is not tracked, or sells past zero, reads `inventory: 999` and a save never adjusts it | 999 written back would become real stock |
| Per-variant `imageId` and the main image's `alt` round-trip | Picking a variant's photo and writing alt text are edits too |

Against Odoo, badges map to ribbons: `new` or `bestseller` sets the product's
manual ribbon with that storefront badge, creating one if the database has none,
and an empty list clears it. A ribbon the storefront does not offer is left alone.

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
GET    /admin/categories        → { items, total }  every category, empty ones included
POST   /admin/categories        { slug, name, parent, blurb } → Category
DELETE /admin/categories/:slug  → { ok: true }
```

`GET /admin/categories` has the same node shape as the public `GET /categories`
tree, but also lists categories with no published products. The Categories
screen and the product editor's Organise tab use it — the public list hides a
category until something published is filed in it, which is exactly the moment
an admin needs to see it.

Against a real backend (`VITE_DATA_SOURCE=api`) the admin covers the catalogue
and order fulfilment. Discounts, Storefront and Import / export leave the nav and
their routes say where the job is done instead. Fields the backend works out itself —
rating, demand counts, purchaser fit feedback, and the sale / sold-out /
low-stock badges — are shown read-only; only the `new` and `bestseller` badges
are editable. Uploads are JPEG, PNG, WebP or GIF, and a slug cannot end in a
number.

Deleting a category **promotes its children to the deleted node's parent**
rather than orphaning them. A category tree with unreachable nodes is worse than
a flat one.

### Orders

```
GET   /admin/orders?q=&status=&payment=&delivery=&page=1&per_page=25
        → { items: AdminOrder[], total, page, perPage, counts }
GET   /admin/orders/:id            → AdminOrder   (id, order number, or backend id)
PATCH /admin/orders/:id  { action, tracking? }  → AdminOrder
```

The screen is built for whoever packs the parcels, in both modes.

**The list** opens on tabs that are jobs rather than a status enum — All, To ship,
Awaiting payment, Shipped, Delivered, Cancelled — each with its count from
`counts` (counted over every order, whatever tab is open, and always equal to
what the tab lists). **Awaiting payment** holds every order whose money has not
arrived: a payment still pending, such as Cash on Delivery or a bank transfer, or
no payment recorded at all. Cancelled orders are left out, and the tab says so
in a hint while it is open. Search finds an order
number, a customer name or email, or a tracking number; pages are 25 long. Each
row shows the number and date, the customer, items, total, and two badges: payment
and delivery. The Overview shows **To ship** and **Awaiting payment** from the same
counts.

**The detail page** (`/admin/orders/:id`) shows the order's progress (Placed →
Paid → Shipped → Delivered), the items and totals, the customer and shipping
address, a Payment card and a Delivery card. Its buttons come straight from the
order's `actions`, so nothing is offered that the backend would refuse:

| Action | Button | What it does | In Odoo |
| --- | --- | --- | --- |
| `ship` | Mark as shipped | Records carrier, tracking number and link (all optional). The shopper's order page shows *On its way* and a Track parcel button | Validates every open outgoing delivery order in full and stores the tracking. A Cash on Delivery quotation is confirmed first |
| `update_tracking` | Add / Update tracking | Changes the tracking; a field left out is kept | Updates the delivery order's tracking reference and the stored carrier / link |
| `deliver` | Mark as delivered | Sets the delivered time; ships first if it had not been | Sets **Delivered on** on the sales order |
| `record_payment` | Record cash received | Marks a cash-on-delivery payment as received | Completes the pending offline transaction, which confirms the order and follows your invoicing settings |
| `cancel` | Cancel order | Only before it ships. The stock goes back on sale | Cancels the order and its open delivery orders, without Odoo's cancel wizard |

An action the order does not currently allow answers `409 action_not_allowed`; an
unknown action `422 invalid_action`; a tracking link that is not `http(s)://`
`422 invalid_tracking`. Errors appear in the card the action belongs to, with the
server's message. The old `{ "status": "fulfilled" | "delivered" | "cancelled" }`
body still works and maps to ship, deliver and cancel.

**Refunds** are issued from the Payment card in the demo. Against Odoo they are
issued in Odoo — the card links to the order there (`backendUrl`).

### Settings

```
PATCH /admin/storefront   → the storefront document
```

Deep-merged, except arrays which replace wholesale — see
[CONFIGURATION.md](CONFIGURATION.md#where-settings-come-from).

### Media

```
POST   /admin/media      multipart/form-data, field name "file"
                         → { id, url, type, width, height, duration?, bytes }
GET    /admin/media      → { items, total }
DELETE /admin/media/:id
```

**Multipart, not JSON.** A base64 body is a third larger and holds the whole
file in memory twice.

`type` is `image` or `video`. Return `width` and `height` — the storefront puts
them on the element so the grid does not reflow while a shot decodes, which is
the main source of layout shift on a catalogue page.

The product then stores whatever `url` you returned. Nothing downstream cares
where it points.

In mock mode uploads go to IndexedDB, images are re-encoded to a 1600px WebP,
and the product stores a `media:<id>` reference. That is right for a demo — it
survives a reload and holds a few dozen files — and wrong for a shop, which is
why the same button posts to your endpoint the moment `VITE_DATA_SOURCE=api`.

### Normalise on write

A first integration will POST a product with a title, a slug and a price and
nothing else. Fill the rest in:

```
tags []   badges []   details []   care []   categories []
images [] variants [] options []   swatches {}
rating { average: 0, count: 0 }     published true     createdAt now()
```

Defaulting once at the write boundary is what stops a missing `rating` surfacing
three screens away as a crash inside a sort comparator — which takes down the
whole listing rather than one card.

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
- Bumping `VERSION` in `src/lib/db.js` **backfills** on next load: fields the
  seed has gained since — enrichment, size charts — appear on existing products,
  and anything already there, including everything you have edited, is kept.
  Products you created are untouched.

  Reseeding outright would be worse than useless: the catalogue would look fine
  and your work would be silently gone. A real backend runs ordered migrations
  against a schema; a field-level merge is the honest browser equivalent, and it
  is why this file never runs in `api` mode.

  If a store looks stale after an upgrade — a block that should be there and is
  not — reload once. If it persists, **Import / export → Reset to demo data**.
