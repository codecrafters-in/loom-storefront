# The database prompt

Copy the block below into Claude, ChatGPT or any coding agent. Fill in the three
lines at the top and it will produce a migration-ready schema for your database,
matched to this storefront's contract.

Pair it with [INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md) — that one builds the
API, this one builds what sits behind it. Run this first.

---

````markdown
You are designing the database behind the LOOM storefront theme — an
open-source React storefront that talks to one documented HTTP contract. I am
giving you the exact shapes that contract requires. Design the schema that
serves them.

## Fill these in

- DATABASE: <!-- PostgreSQL 16 / MySQL 8 / SQLite / SQL Server / MongoDB -->
- ORM / MIGRATIONS: <!-- Prisma / Drizzle / TypeORM / Django / ActiveRecord / raw SQL + Flyway -->
- SCALE: <!-- e.g. 2,000 products, 400 orders a day -->

## Deliver

1. The full schema as migration files in my stated tool.
2. An ER diagram in plain text.
3. The indexes, with a sentence each on which query they serve.
4. A seed script inserting one complete product so I can verify it.
5. The queries for the three hard reads, written out (below).

## Non-negotiable rules

**1. Money is an integer of the currency's smallest unit, in a separate column
from its currency code.**

```sql
price_amount   integer     not null,   -- 12800 = $128.00
price_currency char(3)     not null
```

Never `float`, `double`, `real`, `decimal` or a database `money` type. `0.1 +
0.2` is not `0.3` in binary floating point, and a cart summed in floats is
eventually a cent out on a real invoice. Integer minor units are also exactly
what Stripe and Razorpay expect, so the value passes through untouched.

Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) use whole units. Do not
hardcode a divide-by-100 anywhere.

**2. Stock is a ledger, not a column.**

```sql
create table inventory_movements (
  id            bigserial primary key,
  variant_id    uuid not null references variants(id),
  delta         integer not null,        -- -1 on sale, +10 on restock
  reason        text not null,           -- sale | restock | correction | return
  operation_id  text unique,             -- idempotency key
  created_at    timestamptz not null default now()
);
```

`variants.inventory` is a cached total, corrected from this table. Three reasons,
and I want you to keep all three:

- Two people adjusting the same SKU with `SET quantity = 5` silently overwrite
  each other. Two `delta` rows both land.
- A webhook delivered twice is a duplicate insert on `operation_id`, which is a
  no-op instead of double-counting.
- "Where did forty units go" has an answer.

**3. Variants own stock and price, products do not.** The storefront greys out
sizes that are unavailable *in the colour currently selected*, which is only
expressible per variant. A sold-out product still returns its variants with
`available = false` — never an empty set.

**4. Categories are self-referencing with a `parent_id`, stored flat and served
as a tree.** Write me the recursive CTE for "all descendants of a category" and
the one for "product count including descendants" — filtering by a parent must
include its children, or `/shop/shirts` is empty while `/shop/shirts-linen` is
not.

**5. Image `alt` is `not null`.** An empty string is a bug, not a styling choice.

**6. Every mutable row gets `created_at`, `updated_at` and an `updated_at`
trigger.** Products additionally get a `version` integer for optimistic
concurrency, so two admins editing one product produce a conflict rather than a
silent overwrite.

## The tables I need

Match these to the storefront's shapes.

**Catalogue**
- `products` — slug (unique), title, subtitle, description, details (string
  list), care (string list), tags (filterable — it is a facet and a
  recommendation input, so do not bury it in a JSON blob), price,
  compare_at_price, rating_average, rating_count, badges, published (drafts are
  invisible to the storefront and 404 on their own URL), created_at, updated_at,
  version
- `product_images` — product_id, url, alt (**not null** — an empty string is a
  bug, not a styling choice), width, height, position, and an optional
  `option_value_id` so a colour can own its photograph. The storefront's gallery
  follows the colour picker when this is set.
- `product_options` — product_id, name ("Color", "Size"), position
- `option_values` — option_id, value, swatch_hex, position
- `variants` — product_id, sku (unique), price, compare_at_price, inventory
  (cached), available (generated from inventory > 0), image_id (which shot to
  show when this variant is picked)
- `variant_option_values` — the join that says which value combination a variant
  is
- `categories` — slug (unique), name, parent_id (self-reference), blurb,
  image_url, position
- `product_categories` — join. Products are filed against **the leaf and its
  ancestors**, so a category read does not have to walk the tree on every
  request. Keep the recursive CTE for rebuilding those rows after a re-parent.
- `collections`, `collection_products` — hand-curated sets

**Apparel specifics.** These are the highest-value fields in an apparel
catalogue — size and fit cause roughly two thirds of fashion returns:
- `size_charts` — id, unit, note, columns (ordered), shared across products
- `size_chart_rows` — chart_id, position, cells
- `product_fit` — product_id, verdict (`true-to-size` | `runs-small` |
  `runs-large`), feedback_small, feedback_true, feedback_large (integers summing
  to 100, from purchasers), sample_size, note, model_height_cm, model_size,
  model_label, size_chart_id
- `product_fabric` — product_id, weight_gsm, weave, origin
- `fabric_composition` — product_id, material, percent (CHECK total = 100)
- `fabric_certifications` — product_id, certification (OEKO-TEX, GOTS, RWS…)

**Commerce**
- `carts`, `cart_lines` — cart lines store `unit_price_amount` **as captured**,
  so a sale ending mid-session does not silently reprice an open bag. The
  captured price is a quote, not a promise: reprice every line from `variants`
  at checkout and tell the shopper if anything moved.
- `discounts` — code, label, active, kind (`percent` | `fixed` | `shipping` —
  these exact strings; the storefront branches on them), value, starts_at,
  ends_at, usage_limit, used_count, minimum_subtotal
- `orders`, `order_lines` — order lines are a **snapshot**: title, options and
  price copied at purchase, never a live join to `products`. A product renamed
  next year must not change a receipt from last year.
- `customers`, `addresses`, `wishlist_items`
- `reviews` — product_id, author, rating, body, verified, size_purchased,
  height, fit (`small` | `true` | `large`), created_at
- `review_photos`

**Product enrichment** — highlights, features, the specification table:
- `attribute_groups` — id, label, position
- `attributes` — key (PK), label, group_id, unit, highlight (boolean), position.
  A *suggested* vocabulary, not a schema
- `attribute_values` — suggested values per key
- `product_attributes` — product_id, attribute_key, value (text), is_highlight,
  position. **Highlights and specs share this table**: they are the same
  (key, value) pair shown in two places, and splitting them means the same fact
  stored twice and going stale in one of them
- `product_features` — product_id, icon (an icon name or a URL), title, body,
  position
- `product_compliance` — generic_name, country_of_origin, manufacturer, packer,
  importer, net_quantity, pack_of. Legally mandated in several markets — India's
  Legal Metrology rules require the manufacturer and packer address, the country
  of origin and the net quantity on a listing
- `product_assurances` — product_id, icon, label, note (nullable), position. The
  services block: returns, exchange, repair, payment. A product with no rows
  inherits the store's, so *no rows* and *an empty explicit set* have to be
  distinguishable — say how you would model that
- `makers` — name, location, partner_since, rating, rating_count, note, joined
  from `products.maker_id` (`ON DELETE SET NULL`, never CASCADE — dropping a
  supplier must not delete their products). One mill supplies many products, so
  a rating stored per product goes stale in thirty-nine rows out of forty the
  first time it changes. Add a constraint that a rating cannot exist without a
  count: a supplier score with no denominator is a number somebody typed, and a
  shopper who works that out stops believing the review count too

Three things I want you to get right here and explain:

1. **Do not put a foreign key from `product_attributes.attribute_key` to
   `attributes.key`.** A merchant entering `neckline` before it exists in the
   vocabulary should get a saved product, not a constraint violation. Suggest a
   job that promotes unrecognised keys for review instead.
2. **`value` is `text`.** A weight is `260`, a care instruction is a sentence, a
   certification list is comma-separated. Typing it means a
   value_text/value_number/value_json triple and a CASE in every read. Index
   `(attribute_key, value)` so faceting on it is still fast.
3. **Normalise units at the write boundary** — store `260` with
   `attributes.unit = 'gsm'`, never `260gsm` in one row and `260 GSM` in the
   next. The label renders the unit.

**Derived, not stored by a client**

Say explicitly in your API layer which fields the server computes:
`badges` (`sale` from compare-at, `sold-out` and `low-stock` from the variants),
`available` (`inventory > 0`), and the cascade of a product price change onto
variants that were not individually overridden. A client that can set these can
put the catalogue into a state the storefront renders wrongly.

**Operations**
- `stores` / `store_settings` — the storefront configuration document
  (navigation, home sections, checkout mode). Ask me whether to store it as
  `jsonb` or as normalised tables, and give me your recommendation with a reason.
- `admin_users` — with hashed passwords, and say which algorithm and cost
- `webhook_events` — outbound delivery log with retry state
- `audit_log` — actor, entity, before, after, at

## The three hard reads

Write these out. They are what the storefront actually does, and they are where
a naive schema falls over.

**A. The catalogue page.** Products in a category *including its descendants*,
filtered by size and colour availability and a price range, sorted by one of
five orders, paginated — plus the facet counts for sizes, colours, tags and the
price range, computed over the **whole category** rather than the filtered
result set. (Facets narrowed to the current results is the classic catalogue
bug: pick one colour and every other colour vanishes from the filter panel.)

**B. The product page.** One product with all its images, options, option
values, variants, variant option values, fit, fabric, composition,
certifications and size chart — in as few round trips as you can manage. Tell
me how many queries yours takes and why.

**C. The bootstrap.** Store settings, the category tree with descendant-inclusive
counts, collections, and the first N products for each of several home rails, in
one response.

## Also tell me

1. **Indexes**, each with the query it serves. I expect at minimum: unique slugs,
   every foreign key, a partial index on available variants, full-text search on
   products, and a composite index for the common catalogue filter-plus-sort.
2. **Soft delete or hard delete** — pick one and defend it. Consider that order
   lines reference products that may be discontinued.
3. **Where `jsonb` is right and where it is laziness.** I am willing to use it
   for the settings document; I am suspicious of it for anything I need to
   filter on.
4. **What breaks at 100× my stated scale**, and the first thing you would change.
5. **The migration order**, so foreign keys resolve.

## How to work

Ask me anything you need before you start — multi-currency, multi-store,
multi-language, returns, whether variants can differ in price. Then write the
migrations, then the queries, then the seed.

Do not invent columns the contract does not need. A schema I cannot fill is a
schema I will not maintain.
````

---

## After the schema

1. Run the migrations and the seed.
2. Verify query **A** returns sensible facets for a parent category.
3. Then hand [INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md) to the same agent —
   it builds the API over this schema.
4. Point the storefront at it:
   ```bash
   VITE_DATA_SOURCE=api
   VITE_API_BASE_URL=https://api.yourstore.com/v1
   ```

## If you are not building a database

You do not need one. The theme runs three ways:

| Mode | Database | When |
| --- | --- | --- |
| `mock` | None — browser storage | Demos, design review, the public preview |
| `api` | Someone else's — Odoo, Shopify, Medusa | You already have a system of record |
| `api` + your own | This schema | You are building the commerce backend too |

Only the third needs this document. See
[CONFIGURATION.md](CONFIGURATION.md#where-settings-come-from).
