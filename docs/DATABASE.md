# Database schema

The PostgreSQL 15+ schema behind the `api+db` deployment mode: the storage that
serves the contract in [API.md](API.md) with the shapes in
[DATA-MODEL.md](DATA-MODEL.md).

Read this before you build. Most of it is ordinary, and the parts that are not —
money, the inventory ledger, the category tree — are the parts that are
expensive to change once you have orders in the table.

If you are running `mock` or `api` mode, skip to
[Deployment modes](#deployment-modes); you do not need any of this.

---

## ER overview

```
                          stores ──1:1── storefront_settings
                             │
       ┌─────────────────────┼──────────────────────────────┐
       │                     │                              │
  categories            collections                     products ──1:1── product_fit
   (parent_id ──┐            │                              │      ──1:1── product_fabric
    self-ref)   │            │ collection_products          │
       └────────┘            └──────────────┐               ├──< product_images
       │                                    │               ├──< product_options ──< option_values
       └──< product_categories >────────────┴───────────────┤                              │
                                                            │                              │
                                    size_charts ──1:M──> ───┤                              │
                                        │                   │                              │
                                  size_chart_rows           ├──< variants >── variant_option_values
                                                            │        │                     │
                              product_fabric ──< product_fabric_composition                │
                                        │                   │        ├──< variant_images >──┘
                                        └──< fabric_certifications   │        (→ product_images)
                                                  │                  │
                                            certifications           ├──< inventory_movements  (append-only)
                                                                     │
                                                            ┌────────┴──────────┐
                                                            │                   │
                                                       cart_lines          order_lines
                                                            │                   │
       customers ──< addresses                            carts >── discounts ──< orders
           │  │                                             │                     │
           │  └──< wishlists >── products                   └── customers ────────┘
           │
           └──< reviews ──< review_photos
                  │
                  └── products

  admin_users ──< inventory_movements.created_by
  events ──< webhook_deliveries >── webhook_endpoints
```

Cardinality: `──<` is one-to-many, `>──` many-to-one, `>── ──<` a join table.

---

## Conventions

| Decision | Choice | Why |
| --- | --- | --- |
| Primary keys | `text` public ids (`prod_…`, `var_…`) on a `bigint` surrogate | The contract exposes `id` as an opaque string. Sequential integers in URLs leak volume; UUIDv4 as a clustered key fragments the index. |
| Timestamps | `timestamptz`, never `timestamp` | `timestamp` silently drops the offset. Every `createdAt` in the contract is ISO 8601 with a zone. |
| Text | `text` with `CHECK (length(...))`, never `varchar(n)` | Identical performance in PostgreSQL; widening a `varchar` is a migration, widening a CHECK is not. |
| Enumerations | `text` + `CHECK` | Native `enum` types cannot drop a value, and adding one is transactionally awkward before PG 12. A CHECK is one `ALTER`. |
| Slugs | Lowercase, `UNIQUE` per store | The routing key. See [Indexes](#indexes). |
| Deletes | Soft, via `archived_at` | See [Soft delete](#soft-delete-vs-hard-delete). |

### Money

Every monetary value is **an `integer` of the currency's smallest unit plus a
`char(3)` ISO 4217 code**. Two columns, always adjacent, always named
`*_amount` and `*_currency`.

```sql
CREATE DOMAIN money_minor AS integer;
CREATE DOMAIN currency_code AS char(3) CHECK (VALUE ~ '^[A-Z]{3}$');
```

Never `float`, `real`, `double precision` or `numeric` for a price, and never
PostgreSQL's `money` type.

- **Floats lose cents.** `0.1 + 0.2` is `0.30000000000000004` in IEEE 754. A
  cart of eleven lines summed in floats is eventually a cent out of step with
  the invoice, and the reconciliation ticket takes a day to close.
- **`numeric` is correct but wrong here.** It is arbitrary-precision decimal and
  it would not lose the cent — but it invites two decimal places to be stored
  for a currency that has none, it is slower to sum, and it does not match the
  wire format.
- **Integer minor units are what payment providers expect.** Stripe's
  `unit_amount`, Razorpay's `amount` and Adyen's `value` are all integer minor
  units. Storing them that way means the value passes from column to charge with
  no conversion, and no conversion means no rounding decision to get wrong.
- Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) use whole units. The code
  column is what tells you which; `src/lib/money.js` holds the list.

`integer` tops out at 2,147,483,647 minor units — about USD 21.4m per row. If
you sell aircraft, or price in IDR or VND at scale, make it `bigint`. Do not
make it `numeric`.

### `updated_at`

One trigger function, attached to every mutable table.

```sql
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- attached per table:
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Application code must not set `updated_at`. An ORM that forgets it on one code
path gives you a cache that never invalidates for that path only, which is the
worst class of bug: correct in testing, wrong in production, intermittently.

---

## DDL

### Stores and settings

The schema is multi-store from the first table even if you run one. Retrofitting
a tenant key onto twenty tables with live foreign keys is a weekend; putting it
in now costs one column.

```sql
CREATE TABLE stores (
  id            text PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  default_currency currency_code NOT NULL DEFAULT 'USD',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The document served by GET /storefront. One row per store.
CREATE TABLE storefront_settings (
  store_id   text PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  version    integer NOT NULL DEFAULT 1,
  document   jsonb   NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_is_object CHECK (jsonb_typeof(document) = 'object')
);
```

`storefront_settings.document` is deliberately **one `jsonb` blob**, not fifty
columns. It is read whole, written whole, cached hard, and its shape changes
every time the theme grows a section type — see `src/data/storefront.js`. A
column per key would mean a migration for every new home-page block, and
`PATCH /admin/storefront` is specified as a deep merge, which `jsonb_set` and
`||` do natively.

The exception is `default_currency`, which is promoted to a column because
foreign keys and CHECK constraints elsewhere need it and you cannot reference
into JSON.

### Categories

Flat rows with a `parent_id` pointer, exactly as `src/data/catalog.js` authors
them. Store flat, serve nested.

```sql
CREATE TABLE categories (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  name        text NOT NULL,
  parent_id   text REFERENCES categories(id) ON DELETE SET NULL,
  blurb       text NOT NULL DEFAULT '',
  image_url   text,
  image_alt   text,
  position    integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_slug_unique UNIQUE (store_id, slug),
  CONSTRAINT categories_not_self_parent CHECK (parent_id IS DISTINCT FROM id),
  CONSTRAINT categories_alt_with_image CHECK (image_url IS NULL OR image_alt IS NOT NULL)
);
```

`ON DELETE SET NULL` on `parent_id` implements the documented admin behaviour:
`DELETE /admin/categories/:slug` promotes children to the deleted node's parent.
Do that promotion explicitly in the transaction — `SET NULL` promotes to root,
which is the safe fallback, not the specified one.

`categories_not_self_parent` catches the one-hop cycle. It does not catch
A→B→A; enforce that in the application or in a trigger that walks the ancestry
on insert. In a tree a merchant edits by hand, the one-hop case is 95% of the
real incidents.

`categories_alt_with_image` is the first appearance of a rule that repeats
throughout: **if there is an image, there is alt text.** An empty `alt` is a bug,
not a styling choice ([DATA-MODEL.md](DATA-MODEL.md#image)), and a database that
permits `NULL` there will accumulate thousands of them within a month.

### Products

```sql
CREATE TABLE products (
  id            text PRIMARY KEY,
  store_id      text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  title         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  details       text[] NOT NULL DEFAULT '{}',   -- construction notes
  care          text[] NOT NULL DEFAULT '{}',
  tags          text[] NOT NULL DEFAULT '{}',

  -- Listing price: the lowest active variant price. Cached, not authoritative.
  price_amount        money_minor NOT NULL,
  price_currency      currency_code NOT NULL,
  compare_at_amount   money_minor,
  compare_at_currency currency_code,

  size_chart_id text REFERENCES size_charts(id) ON DELETE SET NULL,

  -- Derived counters, refreshed by trigger or a scheduled job. Never edited.
  rating_average  numeric(2,1) NOT NULL DEFAULT 0,
  rating_count    integer NOT NULL DEFAULT 0,
  bought_last_30d integer NOT NULL DEFAULT 0,
  saved_count     integer NOT NULL DEFAULT 0,

  published_at  timestamptz,
  archived_at   timestamptz,
  version       integer NOT NULL DEFAULT 1,
  search_tsv    tsvector GENERATED ALWAYS AS (
                  setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                  setweight(to_tsvector('english', coalesce(subtitle,'')), 'B') ||
                  setweight(to_tsvector('english', array_to_string(tags, ' ')), 'B') ||
                  setweight(to_tsvector('english', coalesce(description,'')), 'C')
                ) STORED,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_slug_unique UNIQUE (store_id, slug),
  CONSTRAINT products_rating_range CHECK (rating_average BETWEEN 0 AND 5),
  CONSTRAINT products_rating_consistent CHECK ((rating_count = 0) = (rating_average = 0)),
  CONSTRAINT products_compare_at_higher CHECK (
    compare_at_amount IS NULL OR compare_at_amount > price_amount),
  CONSTRAINT products_compare_at_currency CHECK (
    (compare_at_amount IS NULL) = (compare_at_currency IS NULL)),
  CONSTRAINT products_counters_nonneg CHECK (
    rating_count >= 0 AND bought_last_30d >= 0 AND saved_count >= 0)
);
```

Four decisions worth defending:

**`details`, `care` and `tags` are arrays, not join tables.** They are ordered,
they are edited as a whole list, they are never queried independently of the
product, and nothing else references them. A `product_details` table would buy
referential integrity over strings nobody joins to. `tags` is the borderline
case — it is filtered on — but a GIN index on a `text[]` answers
`tags && ARRAY['linen']` faster than the join would.

**`badges` is not a column.** `new`, `sale`, `bestseller`, `low-stock` and
`sold-out` are all functions of data you already store: `created_at`,
`compare_at_amount`, `bought_last_30d`, and the variant stock. Storing them
means a nightly job that gets it wrong for a day. Compute them in the read
query, or in a view.

**`price_amount` is a cache of the cheapest variant.** The contract says the
product price is "lowest variant price, for listings". Deriving it per query
means a correlated subquery on the hottest path in the store, so it is
denormalised — and refreshed by the same trigger that touches variants. Note the
admin rule from [API.md](API.md#write-api-admin): a product price change
cascades to variants **unless the variant has an explicit override**, which is
why variants carry their own price columns rather than inheriting.

**`search_tsv` is a generated column, not a trigger.** `GENERATED ALWAYS AS …
STORED` cannot drift. A trigger can be dropped by a migration and nobody
notices until search quietly returns nothing for products edited since.

### Images

```sql
CREATE TABLE product_images (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt         text NOT NULL,
  width       integer,
  height      integer,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_alt_not_blank CHECK (btrim(alt) <> ''),
  CONSTRAINT product_images_dimensions CHECK (
    (width IS NULL) = (height IS NULL) AND (width IS NULL OR (width > 0 AND height > 0))),
  CONSTRAINT product_images_position_unique UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED
);
```

`alt NOT NULL` plus `btrim(alt) <> ''` is the enforcement of the contract rule.
`NOT NULL` alone is defeated by the empty string, which is precisely what a form
with an untouched optional field submits.

`width`/`height` are nullable but must arrive together — half a pair prevents
layout shift for nobody. The `position` unique constraint is `DEFERRABLE` so a
reorder can renumber rows inside one transaction without tripping on itself.

### Options, values and variants

```sql
CREATE TABLE product_options (
  id         text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       text NOT NULL,            -- 'Color', 'Size'
  position   integer NOT NULL DEFAULT 0,
  CONSTRAINT product_options_name_unique UNIQUE (product_id, name)
);

CREATE TABLE option_values (
  id         text PRIMARY KEY,
  option_id  text NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  value      text NOT NULL,            -- 'Oat', 'M'
  swatch_hex char(7),                  -- '#DCD3C3'; colour options only
  position   integer NOT NULL DEFAULT 0,
  CONSTRAINT option_values_unique UNIQUE (option_id, value),
  CONSTRAINT option_values_hex CHECK (swatch_hex IS NULL OR swatch_hex ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE variants (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         text NOT NULL,
  price_amount        money_minor NOT NULL,
  price_currency      currency_code NOT NULL,
  compare_at_amount   money_minor,
  compare_at_currency currency_code,

  -- Cached from inventory_movements. See "Inventory".
  inventory   integer NOT NULL DEFAULT 0,
  available   boolean NOT NULL GENERATED ALWAYS AS (inventory > 0) STORED,

  position    integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT variants_sku_unique UNIQUE (product_id, sku),
  CONSTRAINT variants_inventory_nonneg CHECK (inventory >= 0),
  CONSTRAINT variants_compare_at_higher CHECK (
    compare_at_amount IS NULL OR compare_at_amount > price_amount)
);

-- Which option value each variant carries: {Color: 'Oat', Size: 'M'}
CREATE TABLE variant_option_values (
  variant_id      text NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  option_value_id text NOT NULL REFERENCES option_values(id) ON DELETE RESTRICT,
  PRIMARY KEY (variant_id, option_value_id)
);

-- Which shot the gallery jumps to when this variant is selected.
CREATE TABLE variant_images (
  variant_id text NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  image_id   text NOT NULL REFERENCES product_images(id) ON DELETE CASCADE,
  position   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (variant_id, image_id)
);
```

`variant_option_values` is not in the naive reading of the contract — the JSON
shows `options` as a flat object — but without it the option map is an untyped
`jsonb` blob and nothing stops a variant claiming `Size: "Medium"` when the
option only offers `M`. `ON DELETE RESTRICT` means removing an option value that
variants still use fails loudly instead of orphaning them.

`available` is a **generated column**, not a stored flag. The contract defines
it as `inventory > 0` and nothing else; making it writable creates a state where
a variant is available with no stock, and that state will happen.

`variants_inventory_nonneg` is the constraint that turns an oversell into a
failed transaction rather than a negative number in a report. Combined with the
ledger below, a concurrent double-purchase of the last unit makes one
transaction fail with a constraint violation, which the API returns as
`409 insufficient_inventory`.

**Sold out is not empty.** A product with no purchasable variants still returns
its variants with `available: false`. Never delete a variant to mark it out of
stock — archive it, or set its inventory to zero. A product page with an empty
variant array has no size picker and nothing to add.

### Categories and collections, joined

```sql
CREATE TABLE product_categories (
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE collections (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  title       text NOT NULL,
  blurb       text NOT NULL DEFAULT '',
  image_url   text,
  image_alt   text,
  position    integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collections_slug_unique UNIQUE (store_id, slug),
  CONSTRAINT collections_alt_with_image CHECK (image_url IS NULL OR image_alt IS NOT NULL)
);

CREATE TABLE collection_products (
  collection_id text NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id    text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);
```

**Products store their leaf category only.** `merino-crew-knit` is in
`knitwear-sweaters`, not in `knitwear` as well. Ancestor resolution happens at
query time (below). Denormalising ancestors into the join table means every
reparent rewrites thousands of rows, and the day one of those rewrites half-runs
you have products in categories that no longer contain them.

Collections are curated and ordered; categories are structural. That is why one
has a `position` on the join and the other does not.

### Size charts

```sql
CREATE TABLE size_charts (
  id         text PRIMARY KEY,          -- 'tops', 'trousers', 'belt'
  store_id   text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  unit       text NOT NULL CHECK (unit IN ('cm','in')),
  note       text NOT NULL DEFAULT '',
  columns    text[] NOT NULL,           -- first column is the size label
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT size_charts_columns_min CHECK (array_length(columns, 1) >= 2)
);

CREATE TABLE size_chart_rows (
  chart_id text NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  cells    text[] NOT NULL,
  PRIMARY KEY (chart_id, position)
);

CREATE FUNCTION size_chart_row_width_ok(p_chart text, p_cells text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT array_length(p_cells, 1) = array_length(columns, 1)
  FROM size_charts WHERE id = p_chart $$;

ALTER TABLE size_chart_rows ADD CONSTRAINT size_chart_rows_width
  CHECK (size_chart_row_width_ok(chart_id, cells));
```

`cells` is `text[]`, not `numeric[]`, because real charts are mixed. The belt
chart in `src/data/fit.js` has `'76–86'` in the "Fits waist" column against
numbers elsewhere in the same row. Forcing numerics means either losing the
range or inventing a second column, and the theme renders the cells as text
regardless.

The row-width CHECK calls a `STABLE` function, which PostgreSQL permits but
does not re-validate if `size_charts.columns` later changes. Add a trigger on
`size_charts` that re-checks its rows on update, or accept that column changes
go through the application. This is the honest trade: the constraint catches the
common error (a row with a missing cell) at near-zero cost.

### Fit, fabric and certifications

```sql
CREATE TABLE product_fit (
  product_id     text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  verdict        text CHECK (verdict IN ('true-to-size','runs-small','runs-large')),
  feedback_small integer,
  feedback_true  integer,
  feedback_large integer,
  sample         integer NOT NULL DEFAULT 0,
  note           text NOT NULL DEFAULT '',
  model_height_cm integer,
  model_size      text,
  model_label     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fit_feedback_all_or_none CHECK (
    num_nonnulls(feedback_small, feedback_true, feedback_large) IN (0, 3)),
  CONSTRAINT fit_feedback_sums CHECK (
    feedback_small IS NULL OR
    (feedback_small BETWEEN 0 AND 100 AND
     feedback_true  BETWEEN 0 AND 100 AND
     feedback_large BETWEEN 0 AND 100 AND
     feedback_small + feedback_true + feedback_large BETWEEN 99 AND 101)),
  CONSTRAINT fit_feedback_needs_sample CHECK (feedback_small IS NULL OR sample > 0),
  CONSTRAINT fit_model_complete CHECK (
    num_nonnulls(model_height_cm, model_size, model_label) IN (0, 3)),
  CONSTRAINT fit_model_height CHECK (model_height_cm IS NULL OR model_height_cm BETWEEN 120 AND 230)
);
```

The percentage constraint is the one people skip and regret. `feedback` is
rendered as a three-segment bar; a set that sums to 87 draws a bar with a gap
in it, and nobody notices until a screenshot goes out. The tolerance is 99–101
rather than exactly 100 because these are rounded percentages of a real sample —
`6 / 88 / 6` from 302 responses will not always sum to exactly 100, and a
constraint that rejects honest data teaches people to fabricate it.

`fit_feedback_needs_sample` enforces the rule from
[CRO.md](CRO.md): feedback comes from purchasers. No sample, no percentages —
omit the block rather than invent it.

```sql
CREATE TABLE product_fabric (
  product_id  text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  weight_gsm  integer,
  weave       text NOT NULL DEFAULT '',
  origin      text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fabric_weight_sane CHECK (weight_gsm IS NULL OR weight_gsm BETWEEN 20 AND 2000)
);

CREATE TABLE product_fabric_composition (
  product_id text NOT NULL REFERENCES product_fabric(product_id) ON DELETE CASCADE,
  position   integer NOT NULL,
  material   text NOT NULL,             -- 'Extra-fine merino wool'
  percent    integer NOT NULL,
  PRIMARY KEY (product_id, position),
  CONSTRAINT composition_percent_range CHECK (percent BETWEEN 1 AND 100)
);

-- Controlled vocabulary. Third-party marks only.
CREATE TABLE certifications (
  code   text PRIMARY KEY,              -- 'OEKO-TEX-100'
  label  text NOT NULL,                 -- 'OEKO-TEX Standard 100'
  issuer text NOT NULL,
  url    text
);

CREATE TABLE fabric_certifications (
  product_id         text NOT NULL REFERENCES product_fabric(product_id) ON DELETE CASCADE,
  certification_code text NOT NULL REFERENCES certifications(code) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, certification_code)
);
```

Certifications are a **lookup table with a foreign key**, not free text on the
product. The contract is explicit that these are third-party marks — OEKO-TEX,
GOTS, RWS, GRS, LWG. A `text[]` column lets a merchant type "Eco-Friendly" and
render it with the same authority as an audited certificate, which is the exact
failure mode the field exists to avoid. `ON DELETE RESTRICT` means retiring a
mark forces you to look at who is claiming it.

Composition percentages deliberately have **no sum constraint**. Real entries
in `src/data/fit.js` include a quilted jacket with `[['Recycled polyester
shell', 100], ['Recycled polyester fill', 100]]` — two components, each 100% of
itself. A `SUM(percent) = 100` rule would reject correct data. Validate per
garment layer in the application if you need it.

### Reviews

```sql
CREATE TABLE reviews (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  order_id    text REFERENCES orders(id) ON DELETE SET NULL,
  author      text NOT NULL,
  rating      integer NOT NULL,
  body        text NOT NULL DEFAULT '',
  verified    boolean NOT NULL DEFAULT false,
  size        text,
  height      text,                     -- as the reviewer typed it: "5'9\""
  fit         text CHECK (fit IN ('small','true','large')),
  status      text NOT NULL DEFAULT 'published'
                CHECK (status IN ('pending','published','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_verified_needs_order CHECK (NOT verified OR order_id IS NOT NULL),
  CONSTRAINT reviews_one_per_order UNIQUE (product_id, order_id)
);

CREATE TABLE review_photos (
  id         text PRIMARY KEY,
  review_id  text NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  url        text NOT NULL,
  alt        text NOT NULL,
  width      integer,
  height     integer,
  position   integer NOT NULL DEFAULT 0,
  CONSTRAINT review_photos_alt_not_blank CHECK (btrim(alt) <> '')
);
```

`reviews_verified_needs_order` makes the verified badge mean something. It is a
one-line constraint that prevents the entire class of "we marked them all
verified" — the badge cannot be set without a matching order row.

`height` is `text`, not a number, because the contract stores what the reviewer
wrote (`"5'9\""`). Product `fit.model.height` is an integer in centimetres,
because that one is authored by the merchant and used for arithmetic. Two fields
that look alike, two different types, for a reason.

`products.rating_average` and `rating_count` are maintained from this table.
Recompute them in an `AFTER INSERT OR UPDATE OR DELETE` statement-level trigger
over the changed products, not per row.

### Customers and addresses

```sql
CREATE TABLE customers (
  id            text PRIMARY KEY,
  store_id      text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  password_hash text,                   -- NULL for passwordless / social
  first_name    text NOT NULL DEFAULT '',
  last_name     text NOT NULL DEFAULT '',
  phone         text,
  accepts_marketing boolean NOT NULL DEFAULT false,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_email_unique UNIQUE (store_id, email)
);

CREATE TABLE addresses (
  id          text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  line1       text NOT NULL,
  line2       text,
  city        text NOT NULL,
  region      text,
  postal_code text NOT NULL,
  country     char(2) NOT NULL,         -- ISO 3166-1 alpha-2
  phone       text,
  is_default  boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addresses_country_format CHECK (country ~ '^[A-Z]{2}$')
);

CREATE UNIQUE INDEX addresses_one_default
  ON addresses (customer_id) WHERE is_default AND archived_at IS NULL;
```

`citext` (from the `citext` extension) makes email comparison case-insensitive
at the storage layer. The alternative — `UNIQUE (store_id, lower(email))` on a
plain `text` column — works too, and is what you use if you cannot install
extensions. Do one of them. Without it, `Sam@example.com` and `sam@example.com`
are two accounts and one of them cannot see their orders.

The partial unique index is the correct way to express "at most one default
address". A `BEFORE INSERT` trigger that unsets the others is a race; this is a
constraint. Setting a new default means clearing the old one in the same
transaction.

### Carts

```sql
CREATE TABLE carts (
  id           text PRIMARY KEY,
  store_id     text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id  text REFERENCES customers(id) ON DELETE SET NULL,
  currency     currency_code NOT NULL,
  discount_id  text REFERENCES discounts(id) ON DELETE SET NULL,
  converted_order_id text,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cart_lines (
  id         text PRIMARY KEY,
  cart_id    text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  quantity   integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_lines_quantity CHECK (quantity > 0),
  CONSTRAINT cart_lines_variant_unique UNIQUE (cart_id, variant_id)
);
```

**Cart lines store no prices.** The contract says every mutation returns the
whole repriced cart, and pricing is a server concern. Storing `unit_price` on
the cart line means a cart opened in March is still quoting March's price in
June. Price at read time from `variants`, and let the customer see the change
before checkout rather than after.

`cart_lines_variant_unique` collapses "add the same thing twice" into a quantity
increment at the schema level, which is the behaviour every shopper expects.

`ON DELETE RESTRICT` on `variant_id` is deliberate: you should not be able to
hard-delete a variant that is in somebody's cart. Archive it instead — the read
query filters archived variants out and the cart line disappears from the
response cleanly.

### Discounts

```sql
CREATE TABLE discounts (
  id             text PRIMARY KEY,
  store_id       text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code           citext NOT NULL,
  label          text NOT NULL,               -- '10% off' — shown to the shopper
  kind           text NOT NULL CHECK (kind IN ('percentage','fixed','free-shipping')),
  percent_off    integer,
  amount_off     money_minor,
  currency       currency_code,
  min_subtotal   money_minor,
  starts_at      timestamptz,
  ends_at        timestamptz,
  max_redemptions integer,
  redemptions    integer NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discounts_code_unique UNIQUE (store_id, code),
  CONSTRAINT discounts_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT discounts_percent_range CHECK (percent_off IS NULL OR percent_off BETWEEN 1 AND 100),
  CONSTRAINT discounts_shape CHECK (
    CASE kind
      WHEN 'percentage'    THEN percent_off IS NOT NULL AND amount_off IS NULL
      WHEN 'fixed'         THEN amount_off IS NOT NULL AND currency IS NOT NULL AND percent_off IS NULL
      WHEN 'free-shipping' THEN percent_off IS NULL AND amount_off IS NULL
    END),
  CONSTRAINT discounts_redemptions CHECK (
    redemptions >= 0 AND (max_redemptions IS NULL OR redemptions <= max_redemptions))
);
```

`discounts_shape` is a CHECK over a `CASE` on the discriminator — the standard
way to model a tagged union in SQL. Without it you get a percentage discount
carrying a stale `amount_off` from when someone changed its type, and the
pricing code picks whichever it reads first.

A `fixed` discount carries its own currency and can only apply to a cart in that
currency. Enforce that in the pricing code; the database cannot see the cart
from here.

### Orders

```sql
CREATE TABLE orders (
  id            text PRIMARY KEY,
  store_id      text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  number        text NOT NULL,                -- 'LM-10428'
  customer_id   text REFERENCES customers(id) ON DELETE SET NULL,
  email         citext NOT NULL,
  status        text NOT NULL DEFAULT 'placed'
                  CHECK (status IN ('placed','paid','fulfilled','delivered','cancelled')),
  currency      currency_code NOT NULL,
  subtotal_amount money_minor NOT NULL,
  discount_amount money_minor NOT NULL DEFAULT 0,
  shipping_amount money_minor NOT NULL DEFAULT 0,
  tax_amount      money_minor NOT NULL DEFAULT 0,
  total_amount    money_minor NOT NULL,

  discount_code  text,
  discount_label text,
  shipping_method text,

  -- Snapshot, not a foreign key. See below.
  shipping_address jsonb NOT NULL,
  tracking_carrier text,
  tracking_code    text,
  tracking_url     text,

  placed_at    timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT orders_number_unique UNIQUE (store_id, number),
  CONSTRAINT orders_amounts_nonneg CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0 AND
    shipping_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0),
  CONSTRAINT orders_total_balances CHECK (
    total_amount = subtotal_amount - discount_amount + shipping_amount + tax_amount),
  CONSTRAINT orders_discount_not_over CHECK (discount_amount <= subtotal_amount),
  CONSTRAINT orders_tracking_complete CHECK (
    (tracking_carrier IS NULL) = (tracking_code IS NULL))
);

CREATE TABLE order_lines (
  id            text PRIMARY KEY,
  order_id      text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id    text REFERENCES variants(id) ON DELETE SET NULL,
  product_slug  text NOT NULL,
  title         text NOT NULL,
  sku           text NOT NULL,
  options       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"Color":"Oat","Size":"M"}
  image_url     text,
  image_alt     text,
  quantity      integer NOT NULL,
  unit_amount   money_minor NOT NULL,
  line_amount   money_minor NOT NULL,
  currency      currency_code NOT NULL,
  CONSTRAINT order_lines_quantity CHECK (quantity > 0),
  CONSTRAINT order_lines_total CHECK (line_amount = unit_amount * quantity),
  CONSTRAINT order_lines_alt_with_image CHECK (image_url IS NULL OR image_alt IS NOT NULL)
);
```

**Order lines snapshot everything; cart lines snapshot nothing.** This is the
single most important asymmetry in the schema. A cart is a live query against
the current catalogue. An order is a record of what was agreed, and it must
still render correctly in five years when the product has been renamed,
repriced, recategorised and archived. `title`, `sku`, `options`, the image and
the price are all copied at placement, and `variant_id` degrades to `NULL`
rather than blocking a delete.

`shipping_address` is `jsonb` for the same reason: a snapshot of the address as
entered. Pointing at `addresses.id` means the invoice changes when the customer
moves house.

`orders_total_balances` catches arithmetic drift at write time. If your pricing
code and your persistence code ever disagree, you find out on the insert instead
of in an accounting reconciliation.

### Wishlists

```sql
CREATE TABLE wishlists (
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);
```

A composite primary key, no surrogate. The natural key is the whole row, the
API operates on `product_slug`, and the primary key makes the optimistic
"add" idempotent under `ON CONFLICT DO NOTHING` — which matters because the
heart button fires optimistically and retries.

### Inventory: an append-only ledger

This is the part to get right.

```sql
CREATE TABLE inventory_movements (
  id           bigserial PRIMARY KEY,
  variant_id   text NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  delta        integer NOT NULL,
  reason       text NOT NULL CHECK (reason IN
                 ('receipt','sale','return','adjustment','damage','import','recount')),
  operation_id text NOT NULL,
  order_id     text REFERENCES orders(id) ON DELETE SET NULL,
  note         text,
  created_by   text REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_delta_nonzero CHECK (delta <> 0),
  CONSTRAINT inventory_movements_operation_unique UNIQUE (operation_id)
);

CREATE INDEX inventory_movements_variant_idx
  ON inventory_movements (variant_id, created_at DESC);

-- Append only. Enforced, not documented.
REVOKE UPDATE, DELETE ON inventory_movements FROM PUBLIC;
CREATE RULE inventory_movements_no_update AS ON UPDATE TO inventory_movements DO INSTEAD NOTHING;
CREATE RULE inventory_movements_no_delete AS ON DELETE TO inventory_movements DO INSTEAD NOTHING;
```

Stock is **not a number you set**. It is the sum of a ledger, and
`variants.inventory` is a cached running total maintained by a trigger:

```sql
CREATE FUNCTION apply_inventory_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE variants
     SET inventory = inventory + NEW.delta,
         updated_at = now()
   WHERE id = NEW.variant_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_inventory_apply AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();
```

Three properties fall out of this, and none of them are available if you store
stock as a settable integer:

**A replayed webhook is a no-op.** `POST /admin/variants/:id/inventory` takes an
`operationId`. Insert the movement with that id; the `UNIQUE` constraint rejects
the duplicate, you catch the violation and return `200`. Your ERP retrying a
delivery three times moves stock once. With a `set` endpoint there is nothing to
deduplicate against — the second write looks exactly like the first.

**Two concurrent adjustments both land.** `UPDATE variants SET inventory =
inventory + $1` takes a row lock and reads the value it is about to modify, so
two `+5` movements arriving together produce `+10`. Two `set` calls computed
from a value each side read before the other wrote produce whichever landed
last, and the other adjustment vanishes silently. This is the lost-update
problem, and it is why [API.md](API.md#write-api-admin) says to prefer the delta.

**You can answer "why".** `SELECT delta, reason, created_at, created_by FROM
inventory_movements WHERE variant_id = …` is the only way to settle a
stock discrepancy. A single integer column tells you the number is wrong and
nothing else.

The `CHECK (inventory >= 0)` on `variants` is what stops an oversell: the
trigger's `UPDATE` fails, the transaction rolls back, the movement is never
recorded, and the API returns `409 insufficient_inventory`. Take the movement
row inside the same transaction as the order line, or you will sell stock you do
not have between the check and the write.

Rebuild the cache at any time:

```sql
UPDATE variants v SET inventory = COALESCE(m.total, 0)
FROM (SELECT variant_id, SUM(delta) AS total
        FROM inventory_movements GROUP BY variant_id) m
WHERE m.variant_id = v.id;
```

Run that as a nightly assertion, not a repair. If it changes any rows you have a
bug worth finding.

### Events and webhooks out

```sql
CREATE TABLE events (
  id          bigserial PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN (
                'product.updated','product.deleted','inventory.updated',
                'category.updated','settings.updated','order.paid','order.fulfilled')),
  subject     text NOT NULL,             -- slug or id the event is about
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_endpoints (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  url         text NOT NULL,
  secret      text NOT NULL,             -- HMAC key; encrypt at rest
  types       text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id           bigserial PRIMARY KEY,
  endpoint_id  text NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id     bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','delivered','failed','abandoned')),
  attempts     integer NOT NULL DEFAULT 0,
  response_code integer,
  last_error   text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_unique UNIQUE (endpoint_id, event_id)
);

CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';
```

The `events` row is written **in the same transaction as the change**, and
delivery is a separate worker reading `webhook_deliveries`. This is the
transactional outbox pattern, and the alternative — firing an HTTP request from
inside the write path — means a rolled-back transaction that already told the
CDN to purge, and a slow endpoint that holds a database lock open.

`webhook_endpoints.secret` signs the payload. An unauthenticated revalidation
endpoint is a free cache-flush attack on your own storefront.

### Admin users

```sql
CREATE TABLE admin_users (
  id            text PRIMARY KEY,
  store_id      text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  password_hash text NOT NULL,
  name          text NOT NULL DEFAULT '',
  role          text NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('owner','admin','staff','read-only')),
  totp_secret   text,
  disabled_at   timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_email_unique UNIQUE (store_id, email)
);
```

A separate table from `customers`, not a `role` column on it. A customer token
must never reach `/admin`, and the cheapest way to guarantee that is for the two
identities to have no shared row, no shared session table and no shared token
issuer. One flag flipped by a mass update on a table the storefront can write to
is a catastrophic single point of failure; two tables is not.

---

## Indexes

Everything below is load-bearing. Add them with the schema, not after the first
slow week.

```sql
-- Routing keys. Uniqueness is the constraint; the index is the side effect.
--   products_slug_unique, categories_slug_unique, collections_slug_unique above.

-- Foreign keys. PostgreSQL does NOT index the referencing side automatically,
-- and an unindexed FK makes every parent delete a sequential scan of the child.
CREATE INDEX product_images_product_idx    ON product_images (product_id, position);
CREATE INDEX variants_product_idx          ON variants (product_id);
CREATE INDEX product_categories_cat_idx    ON product_categories (category_id, product_id);
CREATE INDEX collection_products_prod_idx  ON collection_products (product_id);
CREATE INDEX categories_parent_idx         ON categories (parent_id);
CREATE INDEX reviews_product_idx           ON reviews (product_id, created_at DESC)
                                             WHERE status = 'published';
CREATE INDEX cart_lines_cart_idx           ON cart_lines (cart_id);
CREATE INDEX order_lines_order_idx         ON order_lines (order_id);
CREATE INDEX orders_customer_idx           ON orders (customer_id, placed_at DESC);

-- Partial: buyable variants only. The size picker asks this on every product
-- page, and the index is a fraction of the size of the full one because most of
-- a mature catalogue is archived or out of stock.
CREATE INDEX variants_available_idx ON variants (product_id, id)
  WHERE available AND archived_at IS NULL;

-- Full-text search: GIN over the generated tsvector.
CREATE INDEX products_search_idx ON products USING gin (search_tsv);

-- Tag filtering, straight from the array.
CREATE INDEX products_tags_idx ON products USING gin (tags);

-- The catalogue's hot path: live products in a store, newest first.
-- Covers `sort=newest` with no sort step, and the filter with an index scan.
CREATE INDEX products_catalogue_idx
  ON products (store_id, created_at DESC, id)
  WHERE archived_at IS NULL AND published_at IS NOT NULL;

-- The price sorts get their own, for the same reason.
CREATE INDEX products_price_idx
  ON products (store_id, price_amount, id)
  WHERE archived_at IS NULL AND published_at IS NOT NULL;
```

The composite catalogue index leads with `store_id` because every query filters
on it, then `created_at DESC` because that is the default sort, then `id` to
make it a stable tiebreak and a covering key for keyset pagination. Ordering
matters: `(created_at, store_id)` cannot serve a single-store scan without a
filter step.

Searching:

```sql
SELECT p.*, ts_rank(p.search_tsv, q) AS rank
FROM products p, websearch_to_tsquery('english', $1) q
WHERE p.store_id = $2 AND p.archived_at IS NULL AND p.search_tsv @@ q
ORDER BY rank DESC, p.created_at DESC
LIMIT 24;
```

`websearch_to_tsquery` accepts what shoppers actually type — quoted phrases,
`or`, a leading `-` — without you writing a parser. `plainto_tsquery` ANDs every
word, so "linen shirt blue" returns nothing the moment one term is absent.

---

## Categories: descendants and counts

Every category query resolves the subtree. `GET /products?category=shirts` must
return everything under Oxford, Linen and Flannel, because products only carry
their leaf.

```sql
-- All descendants of a category, including itself.
WITH RECURSIVE subtree AS (
  SELECT id, parent_id, slug, name, 0 AS depth
  FROM categories
  WHERE store_id = $1 AND slug = $2 AND archived_at IS NULL

  UNION ALL

  SELECT c.id, c.parent_id, c.slug, c.name, s.depth + 1
  FROM categories c
  JOIN subtree s ON c.parent_id = s.id
  WHERE c.archived_at IS NULL
)
SELECT * FROM subtree;
```

The non-recursive term seeds with the category itself; the recursive term walks
down. `UNION ALL` rather than `UNION` — `UNION` deduplicates on every iteration,
which costs a sort you do not need in a tree that has no duplicates. If your data
might contain a cycle, add a depth guard (`WHERE s.depth < 10`) or PostgreSQL
will loop until it runs out of memory.

Products in a subtree, deduplicated because a product could sit in two branches:

```sql
WITH RECURSIVE subtree AS ( /* as above */ )
SELECT DISTINCT p.*
FROM products p
JOIN product_categories pc ON pc.product_id = p.id
JOIN subtree s ON s.id = pc.category_id
WHERE p.archived_at IS NULL AND p.published_at IS NOT NULL
ORDER BY p.created_at DESC
LIMIT $3 OFFSET $4;
```

Counts including descendants, for the whole tree in one pass:

```sql
WITH RECURSIVE descendants AS (
  SELECT id AS root_id, id AS node_id FROM categories WHERE store_id = $1
  UNION ALL
  SELECT d.root_id, c.id
  FROM categories c
  JOIN descendants d ON c.parent_id = d.node_id
)
SELECT d.root_id AS category_id, COUNT(DISTINCT pc.product_id) AS count
FROM descendants d
LEFT JOIN product_categories pc ON pc.category_id = d.node_id
LEFT JOIN products p ON p.id = pc.product_id
     AND p.archived_at IS NULL AND p.published_at IS NOT NULL
GROUP BY d.root_id;
```

This is the query behind `Category.count`, and the rule it implements is that a
parent's count includes its descendants. Get it wrong and the menu offers
"Shirts (0)" while every child has stock — the most-reported bug in a
freshly-built catalogue API.

Cache it. It is a whole-tree aggregate that changes when products move, not on
every request; recompute it on `product.updated` and `category.updated`, or
materialise it and refresh concurrently.

**Facets are computed over the category, not over the filtered result.** If you
narrow the colour list to what the current filter shows, selecting Ecru removes
every other colour from the panel and the shopper can never widen their own
search. Run the facet aggregation with all filters applied *except* the one being
faceted.

---

## Optimistic concurrency

`products` and `variants` carry a `version integer`. Every admin write sends the
version it read:

```sql
UPDATE products
   SET title = $1, description = $2, version = version + 1, updated_at = now()
 WHERE id = $3 AND version = $4
RETURNING version;
```

Zero rows returned means somebody else saved between your read and your write.
Return `409 conflict` and let the admin panel re-fetch and show the difference.

The alternative is last-write-wins, which is not a policy but an absence of one:
two people editing the same product from two tabs, and one of them silently
loses their paragraph of description with no error anywhere. `SELECT … FOR
UPDATE` would also work but holds a lock across the user's thinking time, which
in a form-based admin panel is minutes.

Bump `version` on every write to the product's own row. Do not bump it for
inventory movements — stock is not an edit conflict, and the ledger already
handles concurrency correctly.

---

## Soft delete vs hard delete

**Recommendation: soft-delete everything a merchant can see; hard-delete
everything the system generated.**

| Table | Policy |
| --- | --- |
| `products`, `variants`, `categories`, `collections`, `customers`, `addresses` | Soft — `archived_at timestamptz` |
| `orders`, `order_lines`, `inventory_movements`, `events` | Never deleted |
| `carts`, `cart_lines`, `webhook_deliveries` | Hard — expire and purge on a schedule |
| `product_images`, `option_values`, join tables | Hard — `ON DELETE CASCADE` from their parent |

The justification is asymmetry of consequence. Deleting a product that turns out
to be in three orders, a wishlist and a collection either fails on a foreign key
or cascades into records that were meant to be permanent. Deleting a cart from
2024 costs nothing and reclaims space.

The cost of soft delete is real and you must pay it: **every query needs
`WHERE archived_at IS NULL`**, and the one that forgets shows an archived
product on the shop page. Two mitigations, in order of preference:

1. Expose read paths as views (`live_products`, `live_variants`) that carry the
   predicate, and let application code query only those.
2. Put the predicate in the partial indexes, as above, so a query that omits it
   is also visibly slower — which is how you find it.

Do not use a `deleted boolean`. `archived_at` tells you when, which is the
question you actually ask when something disappeared and nobody knows why.

For a real erasure request, hard-delete or pseudonymise `customers` and
`addresses`, and null out `orders.customer_id` while keeping the order row and
its snapshotted line data. The order is a financial record; the identity is not.

---

## Deployment modes

The theme runs in three modes, set by `VITE_DATA_SOURCE`. Only one of them uses
this schema.

| Mode | Database | What you build |
| --- | --- | --- |
| `mock` | None | Nothing |
| `api` | Yours already, in another system | An adapter, not a schema |
| `api+db` | This schema | The API in [API.md](API.md), over these tables |

### `mock`

`VITE_DATA_SOURCE=mock`. The catalogue in `src/data/catalog.js` is compiled into
the bundle and served by `src/lib/api/mock.js`. Carts, wishlists and the
session live in `localStorage`; orders are fabricated and nothing is persisted
beyond the browser.

**This schema is irrelevant here.** No connection string, no migrations, no
server. It is the default, it is what the public demo is built from, and it is
the right mode for design work, for a client review, and for a static
deployment of the theme as a portfolio piece.

Do not extend the mock adapter with business logic you intend to keep. It exists
so the theme is explorable with no backend; anything real belongs behind the
API.

### `api`

`VITE_DATA_SOURCE=api`, pointed at a system that already owns the data — Odoo,
Shopify, Medusa, a bespoke ERP. **You do not run this schema.** Your job is a
translation layer that answers the routes in [API.md](API.md) with the shapes in
[DATA-MODEL.md](DATA-MODEL.md), reading from whatever storage that system uses.

The schema here is still worth reading in that mode, as a specification of what
the contract implies. In particular, the parts your source system probably gets
wrong:

- Prices arriving as decimal strings or floats — convert to integer minor units
  at the boundary, once, in one function.
- Category counts that exclude descendants.
- Facets computed over the filtered result set.
- Variant lists that come back empty when a product is sold out.

### `api+db`

`VITE_DATA_SOURCE=api`, pointed at a service you build on these tables. This is
the mode the document is written for.

Minimum viable path: `stores`, `products`, `product_images`, `product_options`,
`option_values`, `variants`, `variant_option_values`, `categories`,
`product_categories`. That serves `GET /products` and `GET /products/:slug`,
which is the home page, the catalogue and the product page — everything else
degrades to a visible error on its own route rather than a blank screen. Add
carts, then accounts and orders, then reviews and the apparel blocks.

---

## Migrations

Use a plain SQL migration tool, not an ORM's autogenerated diff. The
non-obvious parts of this schema — partial indexes, generated columns, rules on
the ledger, `DEFERRABLE` constraints — are things ORM introspection either
misses or rewrites. Recommended: **[dbmate](https://github.com/amacneil/dbmate)**
or **[golang-migrate](https://github.com/golang-migrate/migrate)** for a plain
SQL pair per migration; **Flyway** if you are on the JVM; **Alembic** if the API
is Python and you accept hand-written revisions.

Naming: a UTC timestamp, an underscore, a verb phrase.

```
db/migrations/
  20260901120000_create_stores_and_settings.sql
  20260901120500_create_catalogue_tables.sql
  20260901121000_create_inventory_ledger.sql
  20260902093000_add_products_search_tsv.sql
  20260914140000_add_variants_version.sql
```

Rules that save weekends:

- **One migration, one concern.** A file that creates four tables and backfills
  two of them cannot be reasoned about when it fails halfway.
- **Every migration has a `down`.** Even if you never run it, writing it forces
  you to notice the ones that are irreversible — dropping a column, narrowing a
  type — and to plan those as two deploys instead of one.
- **Never edit a migration that has run anywhere.** Add another.
- **Index creation on a live table uses `CREATE INDEX CONCURRENTLY`**, outside a
  transaction. A plain `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock and stops
  the storefront for the duration.
- **Adding a `NOT NULL` column with a default is safe on PG 11+**; adding a
  `CHECK` to a populated table is not. Add it `NOT VALID`, then
  `VALIDATE CONSTRAINT` in a second migration, which takes only a `SHARE UPDATE
  EXCLUSIVE` lock.

---

## Seed data

One product, two options, six variants, two images, a size chart. Run it against
a fresh schema; if it commits, your tables agree with this document.

```sql
BEGIN;

INSERT INTO stores (id, slug, name, default_currency)
VALUES ('store_loom', 'loom', 'LOOM', 'USD');

INSERT INTO size_charts (id, store_id, unit, note, columns) VALUES
  ('tops', 'store_loom', 'cm',
   'Measured flat, garment not body. Chest is measured 2.5cm below the armhole and doubled.',
   ARRAY['Size','Chest','Length','Shoulder','Sleeve']);

INSERT INTO size_chart_rows (chart_id, position, cells) VALUES
  ('tops', 0, ARRAY['XS','96','68','43','61']),
  ('tops', 1, ARRAY['S','102','70','45','62']),
  ('tops', 2, ARRAY['M','108','72','47','64']);

INSERT INTO categories (id, store_id, slug, name, parent_id, blurb) VALUES
  ('cat_knitwear', 'store_loom', 'knitwear', 'Knitwear', NULL,
   'Merino, lambswool, and cotton for the in-between months.'),
  ('cat_knit_sweaters', 'store_loom', 'knitwear-sweaters', 'Sweaters', 'cat_knitwear',
   'Crews and cardigans.');

INSERT INTO products (id, store_id, slug, title, subtitle, description,
                      details, care, tags,
                      price_amount, price_currency, size_chart_id,
                      rating_average, rating_count, published_at, created_at)
VALUES ('prod_merino', 'store_loom', 'merino-crew-knit', 'Fine Merino Crew',
        '19.5 micron extra-fine merino',
        'Knitted to shape rather than cut from a sheet, so the shoulder seam sits where it should.',
        ARRAY['19.5 micron extra-fine merino','Fully fashioned, 12gg'],
        ARRAY['Hand wash cool','Dry flat'],
        ARRAY['merino','layering'],
        16800, 'USD', 'tops', 4.8, 302, now(), '2026-02-14T00:00:00Z');

INSERT INTO product_categories (product_id, category_id)
VALUES ('prod_merino', 'cat_knit_sweaters');

-- Two images. alt is NOT NULL and non-blank; the grid swaps to the second on hover.
INSERT INTO product_images (id, product_id, url, alt, width, height, position) VALUES
  ('img_merino_1', 'prod_merino', '/images/products/merino-crew-knit-1.jpg',
   'Fine Merino Crew in Oat', 900, 1125, 0),
  ('img_merino_2', 'prod_merino', '/images/products/merino-crew-knit-2.jpg',
   'Fine Merino Crew, fabric detail', 900, 1125, 1);

-- Two options: Color (with swatches) and Size.
INSERT INTO product_options (id, product_id, name, position) VALUES
  ('opt_merino_color', 'prod_merino', 'Color', 0),
  ('opt_merino_size',  'prod_merino', 'Size',  1);

INSERT INTO option_values (id, option_id, value, swatch_hex, position) VALUES
  ('ov_oat',      'opt_merino_color', 'Oat',      '#DCD3C3', 0),
  ('ov_charcoal', 'opt_merino_color', 'Charcoal', '#3A3A3C', 1),
  ('ov_s', 'opt_merino_size', 'S', NULL, 0),
  ('ov_m', 'opt_merino_size', 'M', NULL, 1),
  ('ov_l', 'opt_merino_size', 'L', NULL, 2);

-- Six variants: 2 colours x 3 sizes.
INSERT INTO variants (id, product_id, sku, price_amount, price_currency, position) VALUES
  ('var_merino_oat_s', 'prod_merino', 'MERINO-OAT-S', 16800, 'USD', 0),
  ('var_merino_oat_m', 'prod_merino', 'MERINO-OAT-M', 16800, 'USD', 1),
  ('var_merino_oat_l', 'prod_merino', 'MERINO-OAT-L', 16800, 'USD', 2),
  ('var_merino_cha_s', 'prod_merino', 'MERINO-CHA-S', 16800, 'USD', 3),
  ('var_merino_cha_m', 'prod_merino', 'MERINO-CHA-M', 16800, 'USD', 4),
  ('var_merino_cha_l', 'prod_merino', 'MERINO-CHA-L', 16800, 'USD', 5);

INSERT INTO variant_option_values (variant_id, option_value_id) VALUES
  ('var_merino_oat_s','ov_oat'), ('var_merino_oat_s','ov_s'),
  ('var_merino_oat_m','ov_oat'), ('var_merino_oat_m','ov_m'),
  ('var_merino_oat_l','ov_oat'), ('var_merino_oat_l','ov_l'),
  ('var_merino_cha_s','ov_charcoal'), ('var_merino_cha_s','ov_s'),
  ('var_merino_cha_m','ov_charcoal'), ('var_merino_cha_m','ov_m'),
  ('var_merino_cha_l','ov_charcoal'), ('var_merino_cha_l','ov_l');

-- Stock arrives as ledger entries, never as an UPDATE. One size lands on zero
-- so the size picker has something to grey out.
INSERT INTO inventory_movements (variant_id, delta, reason, operation_id) VALUES
  ('var_merino_oat_s', 4, 'receipt', 'seed:merino-oat-s'),
  ('var_merino_oat_m', 6, 'receipt', 'seed:merino-oat-m'),
  ('var_merino_oat_l', 2, 'receipt', 'seed:merino-oat-l'),
  ('var_merino_cha_s', 3, 'receipt', 'seed:merino-cha-s'),
  ('var_merino_cha_m', 5, 'receipt', 'seed:merino-cha-m');
  -- var_merino_cha_l intentionally receives nothing: inventory 0, available false.

INSERT INTO product_fit (product_id, verdict, feedback_small, feedback_true,
                         feedback_large, sample, note,
                         model_height_cm, model_size, model_label)
VALUES ('prod_merino', 'true-to-size', 6, 88, 6, 302,
        'Fully fashioned, so it holds its shape. Take your usual size.',
        175, 'S', '5''9"');

INSERT INTO product_fabric (product_id, weight_gsm, weave, origin)
VALUES ('prod_merino', 260, '12gg fully fashioned', 'Biella, Italy');

INSERT INTO product_fabric_composition (product_id, position, material, percent)
VALUES ('prod_merino', 0, 'Extra-fine merino wool', 100);

INSERT INTO certifications (code, label, issuer) VALUES
  ('RWS', 'Responsible Wool Standard', 'Textile Exchange'),
  ('OEKO-TEX-100', 'OEKO-TEX Standard 100', 'OEKO-TEX Association');

INSERT INTO fabric_certifications (product_id, certification_code) VALUES
  ('prod_merino', 'RWS'), ('prod_merino', 'OEKO-TEX-100');

COMMIT;

-- Verify: five available variants, one sold out, 20 units in total.
SELECT sku, inventory, available FROM variants
WHERE product_id = 'prod_merino' ORDER BY position;
```

If the last query returns `MERINO-CHA-L | 0 | false` and the other five with
stock, the ledger, the trigger and the generated column are all wired correctly.

---

## MySQL 8 and SQLite

The schema is written for PostgreSQL and uses it deliberately. Porting is
possible; here is what changes.

| Feature | MySQL 8 | SQLite |
| --- | --- | --- |
| `text[]` (`details`, `care`, `tags`, `columns`, `cells`) | Join table, or `JSON` array | Join table, or `TEXT` holding JSON |
| `jsonb` | `JSON` — no binary index, no `GIN` | `TEXT` + `json_extract()` |
| `citext` | `utf8mb4_0900_ai_ci` collation on the column | `TEXT COLLATE NOCASE` |
| `CHECK` constraints | Enforced from 8.0.16; **silently ignored before** | Enforced since 3.37; verify `PRAGMA integrity_check` |
| Partial indexes (`WHERE …`) | Not supported — index the whole column, or add a generated boolean and index that | Supported |
| `GENERATED ALWAYS AS … STORED` | Supported | Supported (3.31+) |
| Full-text (`tsvector` + GIN) | `FULLTEXT` index with `MATCH … AGAINST`; no weighting | FTS5 virtual table, kept in sync by triggers |
| `DEFERRABLE` constraints | Not supported — renumber positions via a temporary offset | Not supported |
| `timestamptz` | `TIMESTAMP` (stores UTC, converts on read) — set `time_zone='+00:00'` | `TEXT` in ISO 8601, UTC, always |
| `DOMAIN` (`money_minor`) | Not supported — inline `INT` and repeat the CHECK | Not supported — inline `INTEGER` |
| `RULE` on `inventory_movements` | Not supported — use `BEFORE UPDATE`/`BEFORE DELETE` triggers that `SIGNAL SQLSTATE '45000'` | Trigger with `RAISE(ABORT, …)` |
| `bigserial` | `BIGINT AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| Recursive CTE | Supported (8.0+) | Supported (3.8.3+) |

Two things do not change and must not be compromised in either port: **money
stays integer minor units**, and **inventory stays an append-only ledger with a
unique `operation_id`**. Everything else on this page is an implementation
detail; those two are the contract.

SQLite is a reasonable choice for a single-tenant store on one machine, and it
will be faster than you expect. MySQL is a reasonable choice if it is what your
team runs. Neither is a reason to give up the constraints — reimplement them as
triggers rather than moving them into application code, where they will be
enforced on one write path and forgotten on the other.
