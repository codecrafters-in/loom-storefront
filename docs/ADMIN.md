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
| Product record | Details, media, variants, a fit, size and composition tab when the product type has those blocks, highlights and specs, organise. Create and delete |
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
- **Defaults and several values.** A new product starts with its type's
  `specDefaults` as specification rows; choosing another type swaps untouched
  defaults for the new type's and keeps what was typed. An attribute of type
  `tags` takes several values separated by commas and offers the values the store
  already uses as chips under the box; a value nobody used yet is simply typed and
  joins the list when the product is saved. An empty box shows the default as its
  placeholder.
- **Media.** Against a real backend only uploads are offered — JPEG, PNG, WebP or
  GIF; there is no paste-a-URL box and no video.
- **Variants.** Editing one option's values leaves every other option alone;
  removing a value removes its variant rows; removing a whole option asks first
  and removes the rows that used it. Missing combinations are listed for any
  number of options and are never added until asked for.
- **Product type.** Changing the type of a saved product asks first and names the
  specifications the new type does not define, because the backend drops them.
- **A failed save opens the tab to fix** — slug and product type on Details;
  specifications, features and assurances on Highlights & specs; composition,
  country and size chart on the fit and composition tab (Details when the type
  has no such tab); variants, variant prices and stock on Variants; images on
  Media — with the server's message in a toast. The draft is kept.

### Products and their type

The editor follows the product's **type** (`productTypeId`, resolved as
`productType`). On Odoo a type is the product's internal category; the demo has
three fixed ones (Clothing, Goods, Food & drink). `GET /admin/library` lists every
type in the store with `defaultProductTypeId`, and the type's `blocks` decide the
editor:

| Block | When on | When off |
| --- | --- | --- |
| `fit` | Fit panel: verdict, note, model | No fit panel |
| `sizeChart` | Size chart panel; *Size charts* in the admin menu | No size chart panel; the menu item is hidden when no type has one |
| `composition` | A panel titled with `labels.composition` (Fabric, Materials, Ingredients, Contents), weight in `labels.weightUnit` | No composition panel |
| `compliance` | Manufacturer rows under Highlights & specs | Hidden, unless the product already has some |

The tab holding the first three is named for what it holds — *Fit, size & fabric*,
*Materials*, *Ingredients* — and is absent when the type has none of them. The
Details tab's lists use `labels.details` and `labels.care`. The preview leaves out
the blocks the type switches off. A hidden block is not edited, and since
`fit: null` and `fabric: null` mean "unchanged", its stored data is kept.

A new product starts with the default type; with no options at all, or with empty
Colour and Size for a type that has fit or a size chart. Options are any names
(`options: [{ name, values }]`, `variants[].options: { name: value }`); a colour
option — one the library shows as swatches, or one called Colour — is edited with
swatches, every other option with words. Option names and values are suggested
from `GET /admin/library` → `options`, the product type's own first, and
specification keys from `productType.specKeys` first. Without a type (a backend
that predates them) the editor falls back to its old behaviour.

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
| `accept_cancel` | Accept and cancel | The customer asked to cancel: cancels it, with an optional message to them | Cancels as above, voids or refunds the payment and answers the request |
| `decline_cancel` | Decline | The customer asked to cancel: keeps the order, with a message saying why (required) | Answers the request; the message is emailed and shows on the customer's order page |

While a request to cancel waits (`order.cancelRequest.status === "pending"`), a **Cancellation requested** card sits at
the top of the side column with the date and the customer's reason. It replaces **Cancel order** while accepting is
possible. `decline_cancel` without a message answers `422 message_required`.

An action the order does not currently allow answers `409 action_not_allowed`; an
unknown action `422 invalid_action`; a tracking link that is not `http(s)://`
`422 invalid_tracking`. Errors appear in the card the action belongs to, with the
server's message. The old `{ "status": "fulfilled" | "delivered" | "cancelled" }`
body still works and maps to ship, deliver and cancel.

**Refunds** are issued from the Payment card: the demo records them; Odoo refunds
through the payment provider when it can, or with a credit note for a full refund
(`POST /admin/orders/:id/refunds`).

### New orders by phone or email

```
POST /admin/orders
{ "email", "lines": [{ "variantId", "quantity" }], "shipping_address", "shipping_method",
  "payment": "link" | "record" | "quote", "notify", "idempotency_key" }
→ AdminOrder + { created, paymentUrl }
```

**Orders › New order** (live store only) finds products by name or SKU, takes the
customer's email and address, and places the order the way checkout would: Odoo
prices it, adds delivery and taxes and checks the stock. **Send a payment link**
gives a link to the storefront's order page, where the customer pays (and emails
it when asked); **Already paid** books cash or a bank transfer and confirms the
order; **Quotation only** leaves a quotation. A customer who already has an
account gets the order on it. The page keeps one `idempotency_key` per attempt,
so a double click places one order.

### Discounts

```
GET    /admin/discounts            → { items, total }
POST   /admin/discounts            → Discount   (creates, or changes the one with that id or code)
DELETE /admin/discounts/:code      → { ok }     (Odoo archives it)
```

A discount is `{ id, code, label, kind: percent | fixed | shipping, value, active }`;
Odoo adds `automatic`, `minimumAmount`, `startsOn`, `endsOn`, `usageLimit`, `used`,
`editable` and `backendUrl`. The screen edits what it can express (one rule, one
reward on the whole order) and opens anything else in Odoo.

### Returns, reviews and questions

```
GET   /admin/returns?status=open     → { items, total, page, perPage, counts }
PATCH /admin/returns/:id   { action: approve | receive | refund | exchange | credit | reject, reason }
GET   /admin/reviews?status=pending  ·  PATCH /admin/reviews/:id    { action: approve | reject | reply, reply }
GET   /admin/questions?status=pending · PATCH /admin/questions/:id  { action: publish | reject, answer }
```

Live store only: the demo has no shoppers to send them. Each button is the step
the backend offers now (`actions`), with the same email to the customer as in
Odoo.

### Overview numbers

```
GET /admin/dashboard?days=30 → { orders, revenue, averageOrder, visits, conversionRate, abandonedCarts, compare, daily }
```

A live store's Overview adds the last 30 days (orders, revenue, conversion,
abandoned carts and how many came back) and what is waiting: returns to handle,
reviews to approve, questions to answer.

### Settings

```
GET   /admin/storefront   → the storefront document + { admin: { editable, canEdit, backendUrl } }
PATCH /admin/storefront   → the storefront document
```

Deep-merged, except arrays which replace wholesale — see
[CONFIGURATION.md](CONFIGURATION.md#where-settings-come-from).

Against Odoo the **Storefront** screen shows only the settings in `admin.editable`
(name, tagline, description, contact email, locale, tax note, returns window,
stock display and the feature switches), sends only what changed, and links to
the store in Odoo for everything else. A setting Odoo does not let it change is
refused by name (`422 unsupported_setting`), never dropped. Only storefront
managers may save (`admin.canEdit`). The screen also sends a test email through
Odoo's mail server, and says where payment keys and mail passwords are kept:
`/admin/credentials` answers `404 use_odoo_backend` with links.

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

**Against Odoo** the screen works with a spreadsheet: `GET /admin/export?format=csv`
is the catalogue with one row per variant (slug, title, prices, options, SKU,
inventory, images, specs), and `POST /admin/import` takes `{ csv }` as well as
the JSON shape. A file is sent first with `dry_run: true`, and the screen shows
what would be created and updated and every row with a problem before
**Import now**. Only `mode: "merge"` is accepted: Odoo never deletes products
from an import. JSON exports come a page at a time (`page`, `per_page` ≤ 200).

---

## Authentication

**The demo** checks `VITE_ADMIN_USER` / `VITE_ADMIN_PASSWORD` — `admin` / `admin`
by default — entirely in the browser. Those are compiled into the bundle like
every `VITE_` variable, so they are public by construction. That is a demo
affordance, not a design; the customer sign-in at `POST /auth/login` is a
separate thing with a separate session.

**A live store signs in with Odoo.** The admin login page has one button and no
password field. A password typed on the shop's domain can be read by every script
the shop loads — an analytics tag, a compromised dependency, a browser extension —
while Odoo's own login page is where the password, two-factor authentication and
lockouts already live.

1. **Sign in with Odoo** makes a PKCE pair (RFC 7636, `S256`) and a random
   `state`, keeps them in `sessionStorage` under `loom.admin_pkce` — this tab
   only — and sends the browser to

   ```
   {odoo origin}/loom/admin/authorize?store={store code}
     &redirect_uri={shop origin}/admin/callback
     &state=…&code_challenge=…&code_challenge_method=S256
   ```

   Both come from `VITE_API_BASE_URL`: `http://localhost:8069/loom/api/v1/loom`
   is origin `http://localhost:8069` and store `loom`.
2. Odoo shows its login page (and two-factor, if the user has it), asks the user
   to confirm, and redirects to `/admin/callback?code=…&state=…`.
3. The callback refuses a `state` this tab did not issue, without calling the
   API — otherwise a forged link could sign the browser in as whoever made it.
   Then it trades the code:

   ```
   POST /admin/auth/token
   { "grant_type": "authorization_code", "code": "…", "code_verifier": "…", "redirect_uri": "…/admin/callback" }
   → { "token", "expiresAt", "refreshToken", "refreshExpiresAt", "user": { "id", "name", "login", "email" } }
   ```

   and replaces itself in the history, so Back never lands on a spent code.

The session is kept in `localStorage` under `loom.admin_session` as
`{ username, token, expiresAt, refreshToken, refreshExpiresAt }`, times in
milliseconds. The access token lives about an hour; the refresh token about a
week.

**Renewal.** Before an `/admin/*` request whose access token has less than 30
seconds left — or once, after a 401 — the client sends

```
POST /admin/auth/token   { "grant_type": "refresh_token", "refresh_token": "…" }
```

which answers in the same shape with a **new** refresh token, and the request is
retried once. Refresh tokens rotate, and the server revokes the whole session
when an old one is presented again, so the client never spends one twice:
requests in one tab share a single refresh, and tabs take turns through a Web
Lock and read the rotated token from storage. A 400 or 401 from the refresh signs
the panel out; a network error keeps the session.

**Signing out** sends `POST /admin/auth/logout` with the access token as
`Authorization: Bearer` and `{ "refresh_token": "…" }` in the body — the refresh
token is the long-lived half — and forgets the session whether or not the request
arrives.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | A field is missing or malformed |
| 400 or 401 | `invalid_grant` | The code or refresh token is expired, already used, or does not match its verifier or redirect URI |
| 403 | `odoo_sign_in_required` | `POST /admin/auth/login` was sent a password. People use Sign in with Odoo; scripts use an API key |

The authorize URL is derived from the base URL as above. A backend other than
the Odoo module implements the same three endpoints, or changes
`src/lib/admin-session.js` to point at its own login page.

### Scripts and API keys

A script has no browser to send to Odoo. It signs in with an Odoo API key
(*Preferences → Account Security → New API Key* in Odoo) and then sends the token
exactly as the panel does:

```bash
curl -X POST "$API/admin/auth/login" -H 'content-type: application/json' \
  -d '{"login": "admin", "apiKey": "…"}'
# → { "token": "…", "expiresAt": "…" }
curl "$API/admin/orders" -H "Authorization: Bearer $TOKEN"
```

A key acts as its user, with that user's rights, so treat it as a password: give
each script its own Odoo user with only the rights it needs, keep the key in the
script's secret store and never in a `VITE_` variable, and revoke it in Odoo when
the script retires.

For any deployment:

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
a TTL. Odoo does this with signed webhooks: **Connect cache purge** on the store
sends `content.changed` and `product.changed` to the render handler's
`POST /__loom/revalidate` ([DEPLOY.md](DEPLOY.md#settings)). For another backend,
the shape below works the same way:

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
