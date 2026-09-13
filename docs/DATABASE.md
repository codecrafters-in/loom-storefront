# Database schema

The PostgreSQL 15+ schema behind the `api+db` deployment mode: storage that
serves the contract in [API.md](API.md) with the shapes in
[DATA-MODEL.md](DATA-MODEL.md).

Most of it is ordinary. The parts that are not — money, the inventory ledger,
the category tree — are the parts that are expensive to change once you have
orders. Running `mock` or `api` mode? Skip to
[Deployment modes](#deployment-modes); none of this applies.

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
       └──< product_categories >────────────┴───────────────┤                             │
                                                            │                             │
                                     size_charts ──M:1──────┤                             │
                                          │                 │                             │
                                    size_chart_rows         ├──< variants >── variant_option_values
                                                            │       │                     │
                              product_fabric ──< product_fabric_composition               │
                                        │                   │       ├──< variant_images >──┘
                                        └──< fabric_certifications  │      (→ product_images)
                                                  │                 │
                                            certifications          ├──< inventory_movements (append-only)
                                                                    │
                                                            ┌───────┴──────────┐
                                                            │                  │
                                                       cart_lines         order_lines
                                                            │                  │
       customers ──< addresses                            carts >── discounts ──< orders
           │  │                                             │                    │
           │  └──< wishlists >── products                    └── customers ──────┘
           │
           └──< reviews ──< review_photos
                    │
                    └── products

  orders ──< payments ──< refunds          orders ──< shipments
  payment_methods  (what can pay; public configuration only)
  countries ──< country_states             (addresses.country and .region hold their codes)

  admin_users ──< inventory_movements.created_by
  events ──< webhook_deliveries >── webhook_endpoints
```

`──<` one-to-many, `>──` many-to-one, `>── ──<` a join table.

---

## Conventions

| Decision | Choice | Why |
| --- | --- | --- |
| Primary keys | `text` public ids (`prod_…`, `var_…`) | The contract exposes `id` as an opaque string. Sequential integers in URLs leak volume. |
| Timestamps | `timestamptz`, never `timestamp` | `timestamp` silently drops the offset; every contract date is ISO 8601 with a zone. |
| Strings | `text` + `CHECK`, never `varchar(n)` | Identical performance in PostgreSQL. Widening a `varchar` is a migration; widening a CHECK is not. |
| Enumerations | `text` + `CHECK` | Native `enum` types cannot drop a value. A CHECK is one `ALTER`. |
| Deletes | Soft, via `archived_at` | See [Soft delete](#soft-delete-vs-hard-delete). |

### Money

Every monetary value is **an `integer` of the currency's smallest unit plus a
`char(3)` ISO 4217 code** — two columns, always adjacent, named `*_amount` and
`*_currency`.

```sql
CREATE DOMAIN money_minor AS integer;
CREATE DOMAIN currency_code AS char(3) CHECK (VALUE ~ '^[A-Z]{3}$');
```

Never `float`, `real`, `double precision`, and never PostgreSQL's `money` type.

- **Floats lose cents.** `0.1 + 0.2` is `0.30000000000000004` in IEEE 754. An
  eleven-line cart summed in floats eventually disagrees with the invoice, and
  the reconciliation ticket takes a day to close.
- **`numeric` is correct but wrong here.** It would not lose the cent, but it
  invites two decimal places for a currency that has none, and it is not the
  wire format.
- **Integer minor units are what payment providers expect.** Stripe's
  `unit_amount`, Razorpay's `amount`, Adyen's `value`. Storing them this way
  means the value goes from column to charge with no conversion — and no
  conversion means no rounding decision to get wrong.
- Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) use whole units; the code
  column is what tells you which.

`integer` caps at about USD 21.4m per row. Price in IDR at scale and you want
`bigint` — not `numeric`.

### `updated_at`

One trigger function, attached to every mutable table.

```sql
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();   -- repeat per table
```

Application code must never set `updated_at`. An ORM that forgets it on one code
path gives you a cache that never invalidates for that path only: correct in
testing, wrong in production, intermittently.

---

## DDL

Blocks below are grouped for reading, not for execution order — several tables
carry forward references (`products.size_chart_id`, `carts.discount_id`,
`inventory_movements.created_by`). In your migrations, either create tables in
dependency order or create them bare and add the foreign keys in a final
`ALTER TABLE` pass. Requires `CREATE EXTENSION citext`.

### Stores and settings

Multi-store from the first table even if you run one. Retrofitting a tenant key
onto twenty tables with live foreign keys is a weekend; adding it now is a
column.

```sql
CREATE TABLE stores (
  id               text PRIMARY KEY,
  slug             text NOT NULL UNIQUE,
  name             text NOT NULL,
  default_currency currency_code NOT NULL DEFAULT 'USD',
  payment_mode     text NOT NULL DEFAULT 'storefront'
                     CHECK (payment_mode IN ('storefront','hosted')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- The document served by GET /storefront. One row per store.
CREATE TABLE storefront_settings (
  store_id   text PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  version    integer NOT NULL DEFAULT 1,
  document   jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

`document` is deliberately one `jsonb` blob, not fifty columns: it is read
whole, written whole, cached hard, and grows a key every time the theme grows a
home-page section type (`src/data/storefront.js`). A column per key means a
migration per section, and `PATCH /admin/storefront` is specified as a deep
merge, which `||` and `jsonb_set` do natively.

`payment_mode` is a column rather than a key in `document` because the API
branches on it: `storefront` answers the on-site payment routes and serves
`checkout.mode = "payments"`; `hosted` keeps checkout handing the shopper to a
payment page of yours.

### Categories

Flat rows with a `parent_id`, exactly as `src/data/catalog.js` authors them.
Store flat, serve nested — nesting in storage makes every reparent a structural
migration.

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

`ON DELETE SET NULL` promotes orphans to root, which is the safe fallback;
`DELETE /admin/categories/:slug` should promote children to the deleted node's
parent explicitly, in the same transaction. The self-parent CHECK catches the
one-hop cycle, which is most real incidents — A→B→A needs a trigger that walks
the ancestry, or application-level validation.

`categories_alt_with_image` is the first appearance of a rule repeated
throughout: **if there is an image, there is alt text.** An empty `alt` is a
bug, not a styling choice, and a schema that permits `NULL` there accumulates
thousands within a month.

### Products

```sql
CREATE TABLE products (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  title       text NOT NULL,
  subtitle    text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  details     text[] NOT NULL DEFAULT '{}',   -- construction notes
  care        text[] NOT NULL DEFAULT '{}',
  tags        text[] NOT NULL DEFAULT '{}',
  -- Listing price: lowest active variant price. Cached, not authoritative.
  price_amount        money_minor NOT NULL,
  price_currency      currency_code NOT NULL,
  compare_at_amount   money_minor,
  compare_at_currency currency_code,
  size_chart_id text REFERENCES size_charts(id) ON DELETE SET NULL,
  -- Derived counters, refreshed by trigger or scheduled job. Never hand-edited.
  rating_average  numeric(2,1) NOT NULL DEFAULT 0,
  rating_count    integer NOT NULL DEFAULT 0,
  bought_last_30d integer NOT NULL DEFAULT 0,   -- social.boughtLast30Days
  saved_count     integer NOT NULL DEFAULT 0,   -- social.savedCount
  published_at timestamptz,
  archived_at  timestamptz,
  version      integer NOT NULL DEFAULT 1,      -- optimistic concurrency
  search_tsv   tsvector GENERATED ALWAYS AS (
                 setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                 setweight(to_tsvector('english', coalesce(subtitle,'')), 'B') ||
                 setweight(to_tsvector('english', array_to_string(tags,' ')), 'B') ||
                 setweight(to_tsvector('english', coalesce(description,'')), 'C')
               ) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_slug_unique UNIQUE (store_id, slug),
  CONSTRAINT products_rating_range CHECK (rating_average BETWEEN 0 AND 5),
  CONSTRAINT products_rating_consistent CHECK ((rating_count = 0) = (rating_average = 0)),
  CONSTRAINT products_compare_at_higher CHECK (compare_at_amount IS NULL
                                            OR compare_at_amount > price_amount),
  CONSTRAINT products_compare_at_currency CHECK ((compare_at_amount IS NULL)
                                              = (compare_at_currency IS NULL)),
  CONSTRAINT products_counters_nonneg CHECK (rating_count >= 0
    AND bought_last_30d >= 0 AND saved_count >= 0)
);
```

Four decisions worth defending.

**`details`, `care` and `tags` are arrays, not join tables.** They are ordered,
edited as a whole list, never queried independently of the product, and nothing
references them. `tags` is the borderline case since it is filtered on, but a
GIN index on `text[]` answers `tags && ARRAY['linen']` faster than the join.

**`badges` is not a column.** `new`, `sale`, `bestseller`, `low-stock` and
`sold-out` are all functions of `created_at`, `compare_at_amount`,
`bought_last_30d` and variant stock. Storing them means a nightly job that is
wrong for a day. Compute them in the read query or a view.

**`price_amount` caches the cheapest variant.** The contract defines the product
price as the lowest variant price for listings; deriving it per query is a
correlated subquery on the store's hottest path. Refresh it from the trigger
that touches variants. A product price change cascades to variants *unless a
variant has an explicit override* — hence variants carrying their own price.

**`search_tsv` is generated, not triggered.** `GENERATED ALWAYS AS … STORED`
cannot drift. A trigger can be dropped by a migration and nobody notices until
search silently returns nothing for anything edited since.

### Images

```sql
CREATE TABLE product_images (
  id         text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL,
  alt        text NOT NULL,
  width      integer,
  height     integer,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_alt_not_blank CHECK (btrim(alt) <> ''),
  CONSTRAINT product_images_dimensions CHECK ((width IS NULL) = (height IS NULL)
    AND (width IS NULL OR (width > 0 AND height > 0))),
  CONSTRAINT product_images_position_unique UNIQUE (product_id, position)
    DEFERRABLE INITIALLY DEFERRED
);
```

`NOT NULL` alone is defeated by the empty string — which is exactly what a form
with an untouched optional field submits — so `btrim(alt) <> ''` is the
constraint that actually enforces the contract. `width`/`height` are nullable
but must arrive together; half a pair prevents layout shift for nobody. The
position constraint is `DEFERRABLE` so a reorder can renumber inside one
transaction without tripping over itself.

### Options, values and variants

```sql
CREATE TABLE product_options (
  id         text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       text NOT NULL,                    -- 'Color', 'Size'
  position   integer NOT NULL DEFAULT 0,
  CONSTRAINT product_options_name_unique UNIQUE (product_id, name)
);
CREATE TABLE option_values (
  id         text PRIMARY KEY,
  option_id  text NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  value      text NOT NULL,                    -- 'Oat', 'M'
  swatch_hex char(7),                          -- '#DCD3C3'; colour options only
  position   integer NOT NULL DEFAULT 0,
  CONSTRAINT option_values_unique UNIQUE (option_id, value),
  CONSTRAINT option_values_hex CHECK (swatch_hex IS NULL OR swatch_hex ~ '^#[0-9A-Fa-f]{6}$')
);
CREATE TABLE variants (
  id         text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku        text NOT NULL,
  price_amount        money_minor NOT NULL,
  price_currency      currency_code NOT NULL,
  compare_at_amount   money_minor,
  compare_at_currency currency_code,
  inventory  integer NOT NULL DEFAULT 0,       -- cached from inventory_movements
  available  boolean NOT NULL GENERATED ALWAYS AS (inventory > 0) STORED,
  position    integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT variants_sku_unique UNIQUE (product_id, sku),
  CONSTRAINT variants_inventory_nonneg CHECK (inventory >= 0),
  CONSTRAINT variants_compare_at_higher CHECK (compare_at_amount IS NULL
                                            OR compare_at_amount > price_amount)
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
shows `options` as a flat object — but without it that map is untyped and
nothing stops a variant claiming `Size: "Medium"` when the option offers `M`.
`ON DELETE RESTRICT` makes removing an in-use option value fail loudly.

`available` is a **generated column**, not a writable flag. The contract defines
it as `inventory > 0` and nothing else; a writable flag creates a state where a
variant is buyable with no stock, and that state will happen.

`variants_inventory_nonneg` turns an oversell into a failed transaction rather
than a negative number in a report. With the ledger below, a concurrent
double-purchase of the last unit makes one transaction fail the constraint,
which the API returns as `409 insufficient_inventory`.

**Sold out is not empty.** A product with nothing purchasable still returns its
variants with `available: false`. Never delete a variant to mark it out of
stock — archive it, or zero its inventory. An empty variant array leaves the
page with no size picker and nothing to add.

### Category and collection joins

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

Products are filed against **the leaf and its ancestors** — `merino-crew-knit`
carries both `knitwear` and `knitwear-sweaters`. That is what the storefront
emits and what `docs/DATA-MODEL.md` specifies.

Storing only the leaf is defensible and cheaper to maintain, but then every
category read has to walk the tree, and the recursive CTE below stops being an
optimisation and becomes mandatory. Store both rows; keep the CTE for the case
where a category is re-parented and the denormalised rows need rebuilding.

### Size charts

```sql
CREATE TABLE size_charts (
  id         text PRIMARY KEY,            -- 'tops', 'trousers', 'belt'
  store_id   text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  unit       text NOT NULL CHECK (unit IN ('cm','in')),
  note       text NOT NULL DEFAULT '',
  columns    text[] NOT NULL CHECK (array_length(columns, 1) >= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE size_chart_rows (
  chart_id text NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  cells    text[] NOT NULL,
  PRIMARY KEY (chart_id, position)
);
CREATE FUNCTION size_chart_row_width_ok(p_chart text, p_cells text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT array_length(p_cells,1) = array_length(columns,1)
  FROM size_charts WHERE id = p_chart $$;
ALTER TABLE size_chart_rows ADD CONSTRAINT size_chart_rows_width
  CHECK (size_chart_row_width_ok(chart_id, cells));
```

`cells` is `text[]`, not `numeric[]`, because real charts are mixed: the belt
chart in `src/data/fit.js` holds `'76–86'` in one column and numbers in the
rest of the same row. The theme renders cells as text regardless. The width
CHECK calls a `STABLE` function, which PostgreSQL permits but will not
re-validate if `columns` later changes — add a trigger on `size_charts` if you
let merchants edit column sets.

### Fit

```sql
CREATE TABLE product_fit (
  product_id      text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  verdict         text CHECK (verdict IN ('true-to-size','runs-small','runs-large')),
  feedback_small  integer,
  feedback_true   integer,
  feedback_large  integer,
  sample          integer NOT NULL DEFAULT 0,
  note            text NOT NULL DEFAULT '',
  model_height_cm integer,
  model_size      text,
  model_label     text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fit_feedback_all_or_none CHECK (
    num_nonnulls(feedback_small, feedback_true, feedback_large) IN (0, 3)),
  CONSTRAINT fit_feedback_sums CHECK (feedback_small IS NULL OR (
    feedback_small BETWEEN 0 AND 100 AND feedback_true BETWEEN 0 AND 100
    AND feedback_large BETWEEN 0 AND 100
    AND feedback_small + feedback_true + feedback_large BETWEEN 99 AND 101)),
  CONSTRAINT fit_feedback_needs_sample CHECK (feedback_small IS NULL OR sample > 0),
  CONSTRAINT fit_model_complete CHECK (
    num_nonnulls(model_height_cm, model_size, model_label) IN (0, 3)),
  CONSTRAINT fit_model_height CHECK (model_height_cm IS NULL
                                  OR model_height_cm BETWEEN 120 AND 230)
);
```

The percentage constraint is the one people skip and regret. `feedback` renders
as a three-segment bar; a set summing to 87 draws a bar with a gap in it, and
nobody notices until a screenshot goes out. The tolerance is 99–101 rather than
exactly 100 because these are rounded percentages of a real sample — `6/88/6` of
302 responses will not always sum to 100, and a constraint that rejects honest
data teaches people to fabricate it. `fit_feedback_needs_sample` enforces the
rule from [CRO.md](CRO.md): feedback comes from purchasers. No sample, no
percentages — omit the block rather than invent it.

### Fabric and certifications

```sql
CREATE TABLE product_fabric (
  product_id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  weight_gsm integer CHECK (weight_gsm IS NULL OR weight_gsm BETWEEN 20 AND 2000),
  weave      text NOT NULL DEFAULT '',
  origin     text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_fabric_composition (
  product_id text NOT NULL REFERENCES product_fabric(product_id) ON DELETE CASCADE,
  position   integer NOT NULL,
  material   text NOT NULL,                  -- 'Extra-fine merino wool'
  percent    integer NOT NULL CHECK (percent BETWEEN 1 AND 100),
  PRIMARY KEY (product_id, position)
);
-- Controlled vocabulary. Third-party marks only.
CREATE TABLE certifications (
  code   text PRIMARY KEY,                   -- 'OEKO-TEX-100'
  label  text NOT NULL,                      -- 'OEKO-TEX Standard 100'
  issuer text NOT NULL,
  url    text
);
CREATE TABLE fabric_certifications (
  product_id         text NOT NULL REFERENCES product_fabric(product_id) ON DELETE CASCADE,
  certification_code text NOT NULL REFERENCES certifications(code) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, certification_code)
);
```

Certifications are a lookup table with a foreign key, not free text. The
contract is explicit that these are third-party marks — OEKO-TEX, GOTS, RWS,
GRS, LWG. A `text[]` column lets a merchant type "Eco-Friendly" and render it
with the authority of an audited certificate, which is the exact failure the
field exists to prevent.

Composition percentages deliberately have **no sum constraint**. `src/data/fit.js`
contains a quilted jacket with `[['Recycled polyester shell',100],['Recycled
polyester fill',100]]` — two components, each 100% of itself. `SUM = 100` would
reject correct data.

### Reviews

```sql
CREATE TABLE reviews (
  id          text PRIMARY KEY,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  order_id    text REFERENCES orders(id) ON DELETE SET NULL,
  author      text NOT NULL,
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text NOT NULL DEFAULT '',
  verified    boolean NOT NULL DEFAULT false,
  size        text,
  height      text,                          -- as typed by the reviewer: 5'9"
  fit         text CHECK (fit IN ('small','true','large')),
  status      text NOT NULL DEFAULT 'published'
                CHECK (status IN ('pending','published','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_verified_needs_order CHECK (NOT verified OR order_id IS NOT NULL),
  CONSTRAINT reviews_one_per_order UNIQUE (product_id, order_id)
);
CREATE TABLE review_photos (
  id        text PRIMARY KEY,
  review_id text NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  url       text NOT NULL,
  alt       text NOT NULL CHECK (btrim(alt) <> ''),
  width     integer,
  height    integer,
  position  integer NOT NULL DEFAULT 0
);
```

`reviews_verified_needs_order` makes the badge mean something: it cannot be set
without a matching order row, which rules out the entire "we marked them all
verified" class of problem in one line.

`height` is `text` because the contract stores what the reviewer wrote
(`"5'9\""`); `product_fit.model_height_cm` is an integer because that one is
authored by the merchant and used for arithmetic. Maintain
`products.rating_average`/`rating_count` from this table with a statement-level
`AFTER` trigger, not a per-row one.

### Customers and addresses

```sql
CREATE TABLE customers (
  id            text PRIMARY KEY,
  store_id      text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  password_hash text,                        -- NULL for passwordless
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
  country     char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),  -- ISO 3166-1
  phone       text,
  is_default  boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX addresses_one_default
  ON addresses (customer_id) WHERE is_default AND archived_at IS NULL;
```

`citext` makes email comparison case-insensitive in storage. Without it (or
`UNIQUE (store_id, lower(email))` on plain `text`), `Sam@example.com` and
`sam@example.com` are two accounts and one of them cannot see their orders. The
partial unique index is the correct expression of "at most one default address";
a `BEFORE INSERT` trigger that unsets the others is a race, this is a
constraint.

```sql
CREATE TABLE countries (
  code           char(2) PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),   -- ISO 3166-1
  name           text NOT NULL,
  state_required boolean NOT NULL DEFAULT false,
  zip_required   boolean NOT NULL DEFAULT true
);
CREATE TABLE country_states (
  country_code char(2) NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  code         text NOT NULL,                  -- 'GJ', 'NY'
  name         text NOT NULL,                  -- 'Gujarat', 'New York'
  PRIMARY KEY (country_code, code)
);
```

`GET /countries/:code` is one read of these two tables, and the State / region
dropdown at checkout and in the address book is built from it. **Store the state
code in `addresses.region`** whenever the country has rows here, and validate
the write against them: a free-text "Gujrat" is refused with
`422 invalid_address` naming `region`, rather than reaching a courier label.
`addresses.country` can reference `countries(code)` directly; the state cannot,
because most countries have no states, so that check lives in the write path.

### Carts

```sql
CREATE TABLE carts (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  currency    currency_code NOT NULL,
  discount_id text REFERENCES discounts(id) ON DELETE SET NULL,
  converted_order_id text,
  retired_at  timestamptz,                 -- merged into another bag; answers 404
  merged_into text REFERENCES carts(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cart_lines (
  id         text PRIMARY KEY,
  cart_id    text NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  quantity   integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_lines_variant_unique UNIQUE (cart_id, variant_id)
);
```

**Cart lines capture `unit_price_amount` at add-time.** The storefront does the
same (`src/lib/api/mock.js`), and the reason is that a shopper who put something
in a bag at one price should not silently be charged another when a sale ends
mid-session.

The captured price is a quote, not a promise. **Reprice every line from
`variants` at checkout** and tell the shopper if anything moved. Both halves are
required: capture without repricing lets a stale bag undercut you, repricing
without capture makes the bag flicker.

`cart_lines_variant_unique` collapses "add the same thing twice" into a quantity
increment at the schema level. `ON DELETE RESTRICT` means you cannot hard-delete
a variant sitting in somebody's cart — archive it, and the read query drops the
line cleanly.

**One open bag per customer per store.** A cart is *open* while
`converted_order_id` and `retired_at` are both null. Enforce the rule where it
cannot be bypassed:

```sql
CREATE UNIQUE INDEX carts_one_open_per_customer
  ON carts (store_id, customer_id)
  WHERE customer_id IS NOT NULL AND converted_order_id IS NULL AND retired_at IS NULL;
```

Guest carts have no `customer_id`, so any number can exist. The index bites at
the moment a signed-in customer claims one — and that is where the merge
happens, in one transaction: copy the customer's open cart lines into the
claimed cart (`ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity =
GREATEST(cart_lines.quantity, EXCLUDED.quantity)` — the higher quantity, never
the sum), mark the old cart `retired_at = now(), merged_into = <claimed id>`,
then set `customer_id` on the claimed cart. A retired or converted cart answers
`404 cart_not_found`.

`POST /carts` with `{ "fresh": true }` (sent after checkout) inserts a new cart
instead of returning the customer's open one; since the paid cart already has
`converted_order_id`, the index still holds.

### Discounts

```sql
CREATE TABLE discounts (
  id              text PRIMARY KEY,
  store_id        text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code            citext NOT NULL,
  label           text NOT NULL,             -- '10% off' — shown to the shopper
  kind            text NOT NULL CHECK (kind IN ('percent','fixed','shipping')),
  percent_off     integer CHECK (percent_off IS NULL OR percent_off BETWEEN 1 AND 100),
  amount_off      money_minor,
  currency        currency_code,
  min_subtotal    money_minor,
  starts_at       timestamptz,
  ends_at         timestamptz,
  max_redemptions integer,
  redemptions     integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discounts_code_unique UNIQUE (store_id, code),
  CONSTRAINT discounts_window CHECK (ends_at IS NULL OR starts_at IS NULL
                                  OR ends_at > starts_at),
  CONSTRAINT discounts_shape CHECK (CASE kind
    WHEN 'percent'    THEN percent_off IS NOT NULL AND amount_off IS NULL
    WHEN 'fixed'         THEN amount_off IS NOT NULL AND currency IS NOT NULL
                              AND percent_off IS NULL
    WHEN 'shipping' THEN percent_off IS NULL AND amount_off IS NULL END),
  CONSTRAINT discounts_redemptions CHECK (redemptions >= 0
    AND (max_redemptions IS NULL OR redemptions <= max_redemptions))
);
```

`discounts_shape` is a CHECK over a `CASE` on the discriminator — the standard
way to model a tagged union in SQL. Without it you get a percentage discount
carrying a stale `amount_off` from when someone changed its type, and the
pricing code uses whichever it reads first.

### Orders

```sql
CREATE TABLE orders (
  id          text PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  number      text NOT NULL,                 -- 'LM-10428'
  customer_id text REFERENCES customers(id) ON DELETE SET NULL,
  email       citext NOT NULL,
  status      text NOT NULL DEFAULT 'placed' CHECK (status IN
                ('placed','paid','fulfilled','delivered','cancelled')),
  currency        currency_code NOT NULL,
  subtotal_amount money_minor NOT NULL,
  discount_amount money_minor NOT NULL DEFAULT 0,
  shipping_amount money_minor NOT NULL DEFAULT 0,
  tax_amount      money_minor NOT NULL DEFAULT 0,
  total_amount    money_minor NOT NULL,
  discount_code   text,
  discount_label  text,
  shipping_method text,
  shipping_address jsonb NOT NULL,           -- snapshot, not a foreign key
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
  CONSTRAINT orders_amounts_nonneg CHECK (subtotal_amount >= 0 AND discount_amount >= 0
    AND shipping_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0),
  CONSTRAINT orders_total_balances CHECK (total_amount =
    subtotal_amount - discount_amount + shipping_amount + tax_amount),
  CONSTRAINT orders_discount_not_over CHECK (discount_amount <= subtotal_amount),
  CONSTRAINT orders_tracking_complete CHECK ((tracking_carrier IS NULL)
                                          = (tracking_code IS NULL))
);
CREATE TABLE order_lines (
  id           text PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id   text REFERENCES variants(id) ON DELETE SET NULL,
  product_slug text NOT NULL,
  title        text NOT NULL,
  sku          text NOT NULL,
  options      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"Color":"Oat","Size":"M"}
  image_url    text,
  image_alt    text,
  quantity     integer NOT NULL CHECK (quantity > 0),
  unit_amount  money_minor NOT NULL,
  line_amount  money_minor NOT NULL,
  currency     currency_code NOT NULL,
  CONSTRAINT order_lines_total CHECK (line_amount = unit_amount * quantity),
  CONSTRAINT order_lines_alt_with_image CHECK (image_url IS NULL OR image_alt IS NOT NULL)
);
```

**Order lines snapshot everything; cart lines snapshot nothing.** This is the
most important asymmetry in the schema. A cart is a live query against the
current catalogue. An order is a record of what was agreed, and it must still
render in five years when the product has been renamed, repriced,
recategorised and archived. Title, SKU, options, image and price are copied at
placement, and `variant_id` degrades to `NULL` rather than blocking a delete.
`shipping_address` is `jsonb` for the same reason — pointing at `addresses.id`
means the invoice changes when the customer moves house.

`orders_total_balances` catches arithmetic drift at write time: if the pricing
code and the persistence code ever disagree, you find out on the insert rather
than in a reconciliation.

### Shipments

```sql
CREATE TABLE shipments (
  id            text PRIMARY KEY,
  order_id      text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','shipped','delivered','cancelled')),
  carrier       text,
  tracking_code text CHECK (tracking_code IS NULL OR length(tracking_code) <= 128),
  tracking_url  text CHECK (tracking_url IS NULL OR tracking_url ~ '^https?://'),
  delivery_refs text[] NOT NULL DEFAULT '{}',   -- the warehouse's own delivery ids
  shipped_at    timestamptz,
  delivered_at  timestamptz,
  created_by    text,                           -- admin_users.id
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipments_shipped_dated CHECK (status NOT IN ('shipped','delivered') OR shipped_at IS NOT NULL),
  CONSTRAINT shipments_delivered_dated CHECK (status <> 'delivered' OR delivered_at IS NOT NULL)
);
```

**A shipment is a row, not three columns on `orders`.** One order can leave in
two parcels, and "shipped" and "delivered" each carry a time and a person. With
this table the `tracking_*` and `fulfilled_at` columns on `orders` become a
snapshot of the latest shipment — keep them only if a read needs them without a
join. The CHECKs refuse a `javascript:` tracking link and a delivery with no
date, the same rules `PATCH /admin/orders/:id` answers `422 invalid_tracking`
for.

The fulfilment actions write here. Each is a transition guarded by the current
state inside the same transaction, so a double click cannot ship twice:

| Action | Precondition | Write |
| --- | --- | --- |
| `ship` | Order not cancelled; nothing shipped yet | `status = 'shipped'`, `shipped_at`, tracking; one stock movement per line |
| `update_tracking` | A shipment is shipped or delivered | Tracking fields only |
| `deliver` | Shipped, or ship first | `status = 'delivered'`, `delivered_at` |
| `record_payment` | The latest payment is offline and pending | Payment `captured`, order confirmed |
| `cancel` | Nothing shipped | Order `cancelled`, open shipments `cancelled`, stock movements reversed |

### Order, payment and delivery status

The admin order list shows three statuses and stores none of them twice.
`orders.status` is the shopper-facing one; `paymentStatus` and `delivery.status`
are derived:

```sql
CREATE VIEW order_admin_status AS
SELECT o.id, o.store_id,
  CASE
    WHEN p.status IN ('captured','refunded','partially_refunded') THEN 'paid'
    WHEN p.status = 'authorized'                                  THEN 'authorized'
    WHEN p.status IN ('draft','pending')                          THEN 'pending'
    WHEN p.status IN ('failed','cancelled')                       THEN 'failed'
    ELSE 'unpaid'
  END AS payment_status,
  CASE
    WHEN o.status = 'cancelled'            THEN 'cancelled'
    WHEN bool_or(s.status = 'delivered')   THEN 'delivered'
    WHEN bool_or(s.status = 'shipped')     THEN 'shipped'
    ELSE 'to_ship'
  END AS delivery_status
FROM orders o
LEFT JOIN LATERAL (
  SELECT status FROM payments WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
) p ON true
LEFT JOIN shipments s ON s.order_id = o.id AND s.status <> 'cancelled'
GROUP BY o.id, o.store_id, o.status, p.status;
```

`none` — an order with nothing to deliver — comes from its lines and is left out
here for brevity. The tab counts are one scan, not one query per tab:

```sql
SELECT count(*) FILTER (WHERE delivery_status = 'to_ship')   AS to_ship,
       count(*) FILTER (WHERE delivery_status = 'shipped')   AS shipped,
       count(*) FILTER (WHERE delivery_status = 'delivered') AS delivered,
       count(*) FILTER (WHERE payment_status IN ('pending','unpaid')
                          AND delivery_status <> 'cancelled')  AS awaiting_payment,
       count(*) FILTER (WHERE delivery_status = 'cancelled') AS cancelled
FROM order_admin_status
WHERE store_id = $1;
```

Each count is the same predicate as its list filter, so a tab's number always
matches the orders it lists. `awaiting_payment` is the `payment=awaiting` filter:
a payment still pending, or no payment recorded at all, on an order that is not
cancelled.

`orders.status` moves with fulfilment: `fulfilled` once a shipment is shipped,
`delivered` once one is delivered.

### Wishlists

```sql
CREATE TABLE wishlists (
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);
```

Composite key, no surrogate: the natural key is the whole row, and it makes the
add idempotent under `ON CONFLICT DO NOTHING` — which matters because the heart
button fires optimistically and retries.

### Inventory: an append-only ledger

This is the part to get right.

```sql
CREATE TABLE inventory_movements (
  id           bigserial PRIMARY KEY,
  variant_id   text NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  delta        integer NOT NULL CHECK (delta <> 0),
  reason       text NOT NULL CHECK (reason IN
                 ('receipt','sale','return','adjustment','damage','import','recount')),
  operation_id text NOT NULL,
  order_id     text REFERENCES orders(id) ON DELETE SET NULL,
  note         text,
  created_by   text REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_operation_unique UNIQUE (operation_id)
);
CREATE INDEX inventory_movements_variant_idx
  ON inventory_movements (variant_id, created_at DESC);
-- Append only. Enforced, not documented.
REVOKE UPDATE, DELETE ON inventory_movements FROM PUBLIC;
CREATE RULE inventory_movements_no_update AS ON UPDATE TO inventory_movements DO INSTEAD NOTHING;
CREATE RULE inventory_movements_no_delete AS ON DELETE TO inventory_movements DO INSTEAD NOTHING;

CREATE FUNCTION apply_inventory_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE variants SET inventory = inventory + NEW.delta, updated_at = now()
   WHERE id = NEW.variant_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_inventory_apply AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();
```

Stock is **not a number you set**. It is the sum of a ledger, and
`variants.inventory` is a cached running total. Three properties fall out of
this, none of which are available from a settable integer:

**A replayed webhook is a no-op.** `POST /admin/variants/:id/inventory` takes an
`operationId`. Insert the movement with it; the unique constraint rejects the
duplicate, you catch the violation and return `200`. An ERP retrying a delivery
three times moves stock once. With a `set` endpoint there is nothing to
deduplicate against — the second write looks exactly like the first.

**Two concurrent adjustments both land.** `SET inventory = inventory + $1` takes
a row lock and reads the value it is about to modify, so two `+5` movements
arriving together produce `+10`. Two `set` calls, each computed from a value
read before the other wrote, produce whichever landed last and the other
adjustment vanishes silently. That is the lost-update problem, and it is why
[API.md](API.md#write-api-admin) says to prefer the delta.

**You can answer "why".** Selecting `delta, reason, created_at, created_by` for
a variant is the only way to settle a stock discrepancy. A single integer tells
you the number is wrong and nothing else.

`CHECK (inventory >= 0)` on `variants` is what stops an oversell: the trigger's
`UPDATE` fails, the transaction rolls back, no movement is recorded, and the API
returns `409 insufficient_inventory`. Write the movement in the same transaction
as the order line, or you sell stock you do not have between check and write.

Rebuild the cache at any time — run this as a nightly assertion, not a repair.
If it changes rows, you have a bug worth finding.

```sql
UPDATE variants v SET inventory = COALESCE(m.total, 0)
FROM (SELECT variant_id, SUM(delta) AS total FROM inventory_movements
      GROUP BY variant_id) m
WHERE m.variant_id = v.id;
```

### Events and webhooks out

```sql
CREATE TABLE events (
  id          bigserial PRIMARY KEY,
  store_id    text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('product.updated','product.deleted',
                'inventory.updated','category.updated','settings.updated',
                'order.paid','order.fulfilled')),
  subject     text NOT NULL,                 -- slug or id the event is about
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_endpoints (
  id         text PRIMARY KEY,
  store_id   text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  url        text NOT NULL,
  secret     text NOT NULL,                  -- HMAC key; encrypt at rest
  types      text[] NOT NULL DEFAULT '{}',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_deliveries (
  id              bigserial PRIMARY KEY,
  endpoint_id     text NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id        bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','delivered','failed','abandoned')),
  attempts        integer NOT NULL DEFAULT 0,
  response_code   integer,
  last_error      text,
  next_attempt_at timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_unique UNIQUE (endpoint_id, event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';
```

The `events` row is written **in the same transaction as the change**; delivery
is a separate worker. This is the transactional outbox pattern. Firing an HTTP
request from inside the write path means a rolled-back transaction that has
already told the CDN to purge, and a slow endpoint holding a database lock open.
`secret` signs the payload — an unauthenticated revalidation endpoint is a free
cache-flush attack on your own storefront.

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

A separate table from `customers`, not a `role` column on it. A storefront token
must never reach `/admin`, and the cheapest guarantee is two identities with no
shared row, no shared session table and no shared token issuer. One flag on a
table the storefront can write to is a catastrophic single point of failure.

---

## Enrichment

Highlights, features and the specifications table. Three blocks on the product,
one storage shape for two of them.

```sql
-- The suggested vocabulary. Seeded, then owned by the merchant.
CREATE TABLE attributes (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  group_id    text NOT NULL REFERENCES attribute_groups(id),
  unit        text,
  highlight   boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attribute_values (
  attribute_key text NOT NULL REFERENCES attributes(key) ON DELETE CASCADE,
  value         text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (attribute_key, value)
);

CREATE TABLE attribute_groups (
  id       text PRIMARY KEY,
  label    text NOT NULL,
  position integer NOT NULL DEFAULT 0
);

-- Highlights and specs are the same row shape. `is_highlight` decides which of
-- the two blocks a row belongs to, and `position` only matters for highlights
-- because specs are grouped and ordered from the vocabulary on read.
CREATE TABLE product_attributes (
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_key text NOT NULL,
  value         text NOT NULL,
  is_highlight  boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, attribute_key, is_highlight)
);

CREATE TABLE product_features (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  icon       text NOT NULL,          -- an icon name, or a URL
  title      text NOT NULL,
  body       text NOT NULL,
  position   integer NOT NULL DEFAULT 0
);

-- The services block: what happens after the sale. Rows are per product, and a
-- product with none inherits the store's from `storefront_settings`.
--
-- `note` is nullable because most rows do not need one — the label is the
-- reassurance and the note is the wording for the one shopper in twenty who
-- wants to check it before committing.
CREATE TABLE product_assurances (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  icon       text NOT NULL DEFAULT 'check',
  label      text NOT NULL,
  note       text,
  position   integer NOT NULL DEFAULT 0
);

-- The mill. Renders as the first two rows of the compliance block, because that
-- is where a shopper already looks for manufacturing facts and because the
-- address on those rows belongs to the brand, not to whoever wove the cloth.
--
-- Its own table rather than two columns on `products` because one mill supplies
-- many products — renaming it should be one write, not forty.
--
-- Deliberately **no rating column.** This began as a marketplace seller record
-- and lost it on the way: a score for a supplier nobody can review is a number
-- somebody typed, and a shopper who works that out stops believing the review
-- count and the stock level too. The cheapest way to keep a number honest is to
-- have nowhere to put a dishonest one.
CREATE TABLE makers (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name     text NOT NULL,
  location text
);

-- `orders` gains one column for replay safety:
--
--   ALTER TABLE orders ADD COLUMN idempotency_key text;
--   ALTER TABLE orders ADD CONSTRAINT orders_idempotency_unique
--     UNIQUE (idempotency_key);
--
-- Insert with `ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`. Returning
-- no row *is* the replay: look the original up and answer `created: false`.
-- A provider retries, and a retry must not sell the stock twice.

-- What happened to the money, separately from what happened to the parcel.
--
-- An order can be paid and unshipped, shipped and refunded, or placed and never
-- captured. Collapsing the two into one `status` is how a refund ends up
-- looking like a delivery.
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider      text NOT NULL,                       -- razorpay, stripe, custom (cash on delivery, transfer)
  method        text,                                -- card, upi, netbanking, cash_on_delivery…
  flow          text NOT NULL DEFAULT 'direct'
                  CHECK (flow IN ('direct','redirect','offline','token')),
  status        text NOT NULL,                       -- draft | pending | authorized | captured | cancelled | failed | refunded | partially_refunded
  reference     text,                                -- the provider's payment id
  amount        bigint NOT NULL,
  currency      char(3) NOT NULL,
  message       text,                                -- shown while pending, or after a failure
  -- The browser holds an opaque random id for GET /payments/:id. Only its
  -- sha256 is stored, so a copy of this table hands out no payment.
  token_hash    text UNIQUE,
  processed_at  timestamptz,                         -- the order was confirmed from this payment, exactly once
  captured_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- A provider retries its webhook, and a retry must not create a second
  -- payment for the same money. This is what makes the handler idempotent.
  UNIQUE (provider, reference)
);

-- What can pay, when the database rather than a payment platform owns the list.
-- Public configuration only: whatever is here is served to every browser that
-- reaches the payment step, so a secret key in it is a published secret.
CREATE TABLE payment_methods (
  id            text PRIMARY KEY,
  store_id      text NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  code          text NOT NULL,
  name          text NOT NULL,
  flow          text NOT NULL CHECK (flow IN ('direct','redirect','offline','token')),
  enabled       boolean NOT NULL DEFAULT true,
  test_mode     boolean NOT NULL DEFAULT false,
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,  -- publishable key, never a secret
  countries     char(2)[],                           -- NULL: everywhere
  currencies    char(3)[],                           -- NULL: every currency
  position      integer NOT NULL DEFAULT 0,
  UNIQUE (store_id, provider, code)
);

-- Refunds are a list, not a flag on the order.
--
-- A partial refund is the common case — one item back from a three-item order —
-- and a boolean cannot express "refunded twice, for two different reasons". It
-- is also the only shape that reconciles against the provider's own records,
-- which is what anyone doing the books needs.
CREATE TABLE refunds (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount     bigint NOT NULL CHECK (amount > 0),
  currency   char(3) NOT NULL,
  reason     text,
  reference  text,                                   -- the provider's refund id
  restocked  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON payments (order_id, created_at DESC);   -- the latest payment per order
CREATE INDEX ON refunds (payment_id);

-- Every message the store sent, and to whom.
--
-- Kept because "did the customer get their confirmation?" is the first question
-- in every support conversation, and an answer of "probably" is not one. It
-- also makes the send idempotent: a retried webhook must not send a second
-- confirmation for the same order.
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid REFERENCES orders(id) ON DELETE SET NULL,
  event        text NOT NULL,                        -- orderPlaced, shipped, refunded…
  recipient    text NOT NULL,
  subject      text,
  status       text NOT NULL DEFAULT 'queued',       -- queued | sent | failed
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event)
);

-- The store's own vocabulary, learned as it describes products.
--
-- `attributes` is a starting point, not a catalogue. A merchant listing a
-- hundred shirts types "Collar type" on the first and, on the sixtieth, cannot
-- remember whether they wrote "Collar type", "Collar" or "Neck" — and three
-- spellings of one attribute is a facet nobody can filter on. So every key a
-- product write does not recognise is promoted here, with the values seen
-- against it, and offered back on the next product.
--
-- Separate from `attributes` rather than a `custom` flag on it, because the two
-- have different lifecycles: ours ship with the theme and are replaced on
-- upgrade, theirs are the store's data and must never be.
CREATE TABLE library_attributes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL UNIQUE,
  label      text NOT NULL,
  group_id   text REFERENCES attribute_groups(id),
  values     text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Whole blocks of copy saved for reuse. Unlike an attribute these are an
-- editorial choice, so they are saved explicitly rather than learned.
CREATE TABLE library_features (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icon  text NOT NULL,
  title text NOT NULL,
  body  text
);

CREATE TABLE library_assurances (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icon  text NOT NULL DEFAULT 'check',
  label text NOT NULL,
  note  text
);

-- Compliance. Separate from the rest because it is legally mandated in several
-- markets and is audited as a unit.
CREATE TABLE product_compliance (
  product_id       uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  generic_name     text,
  country_of_origin text,
  manufacturer     text,
  packer           text,
  importer         text,
  net_quantity     text,
  pack_of          text
);

CREATE INDEX ON product_attributes (attribute_key, value);
CREATE INDEX ON product_features (product_id, position);
CREATE INDEX ON product_assurances (product_id, position);
```

`products` gains one nullable column for the join:

```sql
ALTER TABLE products ADD COLUMN maker_id uuid REFERENCES makers(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL`, not `CASCADE` — dropping a supplier from the directory must
not delete the products they made.

## Where secrets are not

There is no `credentials` table above, and that is deliberate. A `key_secret` or
an SMTP password belongs in your platform's secret store — environment
variables, AWS Secrets Manager, Doppler — not in the same database your
application queries with a user that can run `SELECT *`.

If you must store them, store them encrypted with a key that is **not** in the
database, and make the read path return `(key, is_set, updated_at)` and nothing
else. The moment an endpoint can return a secret, that secret is in every log
and cache between the database and the browser.

**Keep `makers.location` and `product_compliance.country_of_origin` in
agreement.** They render four rows apart on the page, and derive from the same
fact. A view or a check constraint is worth more here than a note in a runbook.

Three decisions worth defending:

**`attributes.key` is not enforced by a foreign key on `product_attributes`.**
Deliberately. A merchant entering `neckline` before anyone has added it to the
vocabulary should get a saved product, not a constraint violation — and a
nightly job can promote unrecognised keys into `attributes` for review. A
foreign key here turns "describe your product" into "file a ticket".

**Highlights and specs share a table.** They are the same `(key, value)` pair
shown in two places; splitting them means the same fact stored twice and going
stale in one of them. `is_highlight` is part of the primary key so a product can
carry `fabric` in both.

**`product_attributes.value` is `text`, not typed.** A weight is `260`, a care
instruction is a sentence, a certification list is comma-separated. Typing the
column means a `value_text`/`value_number`/`value_json` triple and a `CASE` in
every read, for a table nobody aggregates over. The index on
`(attribute_key, value)` is what makes faceting on it fast enough.

Because the value is untyped, **normalise units at the write boundary**: store
`260` with `attributes.unit = 'gsm'` rather than `260gsm` in one row and
`260 GSM` in the next. The label renders the unit.

## Indexes

All of these are load-bearing. Add them with the schema, not after the first
slow week.

```sql
-- Foreign keys. PostgreSQL does NOT index the referencing side automatically,
-- and an unindexed FK turns every parent delete into a sequential scan.
CREATE INDEX product_images_product_idx   ON product_images (product_id, position);
CREATE INDEX variants_product_idx         ON variants (product_id);
CREATE INDEX product_categories_cat_idx   ON product_categories (category_id, product_id);
CREATE INDEX collection_products_prod_idx ON collection_products (product_id);
CREATE INDEX categories_parent_idx        ON categories (parent_id);
CREATE INDEX cart_lines_cart_idx          ON cart_lines (cart_id);
CREATE INDEX order_lines_order_idx        ON order_lines (order_id);
CREATE INDEX orders_customer_idx          ON orders (customer_id, placed_at DESC);
CREATE INDEX reviews_product_idx          ON reviews (product_id, created_at DESC)
  WHERE status = 'published';

-- The admin order list: newest first per store, and the fulfilment joins.
CREATE INDEX orders_store_placed_idx ON orders (store_id, placed_at DESC, id);
CREATE INDEX shipments_order_idx     ON shipments (order_id) WHERE status <> 'cancelled';
CREATE INDEX shipments_tracking_idx  ON shipments (tracking_code) WHERE tracking_code IS NOT NULL;

-- Partial: buyable variants only. The size picker asks this on every product
-- page, and the index is a fraction of the full one because most of a mature
-- catalogue is archived or out of stock.
CREATE INDEX variants_available_idx ON variants (product_id, id)
  WHERE available AND archived_at IS NULL;

-- Full-text search, and array tag filtering.
CREATE INDEX products_search_idx ON products USING gin (search_tsv);
CREATE INDEX products_tags_idx   ON products USING gin (tags);

-- The catalogue's hot path: live products in a store, newest first.
CREATE INDEX products_catalogue_idx ON products (store_id, created_at DESC, id)
  WHERE archived_at IS NULL AND published_at IS NOT NULL;
CREATE INDEX products_price_idx ON products (store_id, price_amount, id)
  WHERE archived_at IS NULL AND published_at IS NOT NULL;
```

Slug uniqueness is already covered by the `UNIQUE (store_id, slug)` constraints
on `products`, `categories` and `collections` — the constraint is the point, the
index is the side effect.

The composite catalogue index leads with `store_id` because every query filters
on it, then `created_at DESC` because that is the default sort, then `id` as a
stable tiebreak and keyset-pagination key. Order matters: `(created_at,
store_id)` cannot serve a single-store scan without a filter step.

```sql
SELECT p.*, ts_rank(p.search_tsv, q) AS rank
FROM products p, websearch_to_tsquery('english', $1) q
WHERE p.store_id = $2 AND p.archived_at IS NULL AND p.search_tsv @@ q
ORDER BY rank DESC, p.created_at DESC LIMIT 24;
```

`websearch_to_tsquery` accepts what shoppers type — quoted phrases, `or`, a
leading `-` — with no parser of your own. `plainto_tsquery` ANDs every word, so
"linen shirt blue" returns nothing the moment one term is absent.

---

## Categories: descendants and counts

`GET /products?category=shirts` must return everything under Oxford, Linen and
Flannel, because products carry only their leaf.

```sql
-- All descendants of a category, including itself.
WITH RECURSIVE subtree AS (
  SELECT id, parent_id, slug, name, 0 AS depth
  FROM categories WHERE store_id = $1 AND slug = $2 AND archived_at IS NULL
  UNION ALL
  SELECT c.id, c.parent_id, c.slug, c.name, s.depth + 1
  FROM categories c JOIN subtree s ON c.parent_id = s.id
  WHERE c.archived_at IS NULL AND s.depth < 10
)
SELECT * FROM subtree;
```

The non-recursive term seeds with the category itself; the recursive term walks
down. `UNION ALL`, not `UNION` — `UNION` deduplicates on every iteration, a sort
a tree does not need. The `depth < 10` guard is cheap insurance: without it, a
cycle loops until PostgreSQL runs out of memory.

Products in a subtree, deduplicated because a product may sit in two branches:

```sql
WITH RECURSIVE subtree AS ( /* as above */ )
SELECT DISTINCT p.* FROM products p
JOIN product_categories pc ON pc.product_id = p.id
JOIN subtree s ON s.id = pc.category_id
WHERE p.archived_at IS NULL AND p.published_at IS NOT NULL
ORDER BY p.created_at DESC LIMIT $3 OFFSET $4;
```

Counts including descendants, for the whole tree in one pass:

```sql
WITH RECURSIVE descendants AS (
  SELECT id AS root_id, id AS node_id FROM categories WHERE store_id = $1
  UNION ALL
  SELECT d.root_id, c.id FROM categories c
  JOIN descendants d ON c.parent_id = d.node_id
)
SELECT d.root_id AS category_id, COUNT(DISTINCT pc.product_id) AS count
FROM descendants d
LEFT JOIN product_categories pc ON pc.category_id = d.node_id
LEFT JOIN products p ON p.id = pc.product_id
     AND p.archived_at IS NULL AND p.published_at IS NOT NULL
GROUP BY d.root_id;
```

This is `Category.count`, and the rule it implements is that a parent's count
includes its descendants. Get it wrong and the menu offers "Shirts (0)" while
every child has stock — the most-reported bug in a freshly built catalogue API.
Cache it: it is a whole-tree aggregate that changes when products move, not per
request. Recompute on `product.updated` and `category.updated`.

Related: **facets are computed over the category, not over the filtered result.**
Narrow the colour list to what is currently showing and selecting Ecru removes
every other colour from the panel, so the shopper can never widen their own
search. Run each facet aggregation with all filters applied *except* the one
being faceted.

---

## Optimistic concurrency

`products` and `variants` carry a `version integer`. Every admin write sends the
version it read.

```sql
UPDATE products
   SET title = $1, description = $2, version = version + 1, updated_at = now()
 WHERE id = $3 AND version = $4
RETURNING version;
```

Zero rows means somebody saved between your read and your write: return
`409 conflict` and let the admin panel re-fetch and show the difference. The
alternative is last-write-wins, which is not a policy but the absence of one —
two tabs editing the same product, one paragraph silently lost, no error
anywhere. `SELECT … FOR UPDATE` also works but holds a lock across the user's
thinking time, which in a form-based admin panel is minutes.

Bump `version` on writes to the product's own row. Do not bump it for inventory
movements; stock is not an edit conflict and the ledger already handles
concurrency correctly.

---

## Soft delete vs hard delete

**Recommendation: soft-delete everything a merchant can see, hard-delete
everything the system generated.**

| Tables | Policy |
| --- | --- |
| `products`, `variants`, `categories`, `collections`, `customers`, `addresses` | Soft — `archived_at timestamptz` |
| `orders`, `order_lines`, `inventory_movements`, `events` | Never deleted |
| `carts`, `cart_lines`, `webhook_deliveries` | Hard — expire and purge on a schedule |
| `product_images`, `option_values`, join tables | Hard — `ON DELETE CASCADE` from the parent |

The justification is asymmetry of consequence. Deleting a product that turns out
to be in three orders, a wishlist and a collection either fails on a foreign key
or cascades into records meant to be permanent. Deleting a cart from 2024 costs
nothing and reclaims space.

The cost is real and you must pay it: **every read needs `WHERE archived_at IS
NULL`**, and the query that forgets shows an archived product on the shop page.
Two mitigations, in order of preference: expose read paths as views
(`live_products`, `live_variants`) that carry the predicate and query only
those; and put the predicate in the partial indexes, as above, so a query that
omits it is also visibly slower — which is how you find it.

Do not use a `deleted boolean`. `archived_at` tells you *when*, which is the
question you actually ask when something disappeared and nobody knows why.

For an erasure request, hard-delete or pseudonymise `customers` and `addresses`
and null `orders.customer_id`, keeping the order and its snapshotted lines. The
order is a financial record; the identity is not.

---

## Deployment modes

Set by `VITE_DATA_SOURCE`. Only one of the three uses this schema.

| Mode | Database | What you build |
| --- | --- | --- |
| `mock` | None | Nothing |
| `api` | Yours already, in another system | An adapter, not a schema |
| `api+db` | This schema | The API in [API.md](API.md), over these tables |

**`mock`** — the catalogue in `src/data/catalog.js` is compiled into the bundle
and served by `src/lib/api/mock.js`. Carts, wishlists and the session live in
`localStorage`; orders are fabricated and nothing persists beyond the browser.
No connection string, no migrations, no server. It is the default, it is what
the public demo is built from, and it is the right mode for design work, client
review, and deploying the theme as a static portfolio piece. Do not extend the
mock adapter with business logic you intend to keep.

**`api`** — pointed at a system that already owns the data (Odoo, Shopify,
Medusa, a bespoke ERP). **You do not run this schema.** You build a translation
layer answering the routes in [API.md](API.md) with the shapes in
[DATA-MODEL.md](DATA-MODEL.md). The schema is still worth reading as a
specification of what the contract implies, particularly the four things source
systems usually get wrong: prices arriving as decimal strings or floats (convert
to integer minor units at the boundary, once, in one function); category counts
that exclude descendants; facets computed over the filtered result set; and
variant lists that come back empty when a product is sold out.

**`api+db`** — `VITE_DATA_SOURCE=api` pointed at a service you build on these
tables. Minimum viable path: `stores`, `products`, `product_images`,
`product_options`, `option_values`, `variants`, `variant_option_values`,
`categories`, `product_categories`. That serves `GET /products` and
`GET /products/:slug`, which is the home page, catalogue and product page;
everything else degrades to a visible error on its own route rather than a blank
screen. Add carts, then accounts and orders, then reviews and the apparel blocks.

---

## Migrations

Use a plain SQL migration tool, not an ORM's autogenerated diff. The non-obvious
parts here — partial indexes, generated columns, rules on the ledger,
`DEFERRABLE` constraints — are things ORM introspection either misses or
rewrites. Recommended: **dbmate** or **golang-migrate** for a plain SQL pair per
migration; Flyway on the JVM; Alembic with hand-written revisions if the API is
Python.

Naming: UTC timestamp, underscore, verb phrase.

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
  two cannot be reasoned about when it fails halfway.
- **Every migration has a `down`.** Even unused, writing it forces you to notice
  the irreversible ones — dropped columns, narrowed types — and plan them as two
  deploys.
- **Never edit a migration that has run anywhere.** Add another.
- **`CREATE INDEX CONCURRENTLY` on live tables**, outside a transaction. A plain
  `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock and stops the storefront.
- **Adding a CHECK to a populated table**: add it `NOT VALID`, then
  `VALIDATE CONSTRAINT` in a second migration, which takes only a
  `SHARE UPDATE EXCLUSIVE` lock.

---

## Seed data

One product, two options, six variants, two images, a size chart. If it commits,
your tables agree with this document.

```sql
BEGIN;
INSERT INTO stores (id, slug, name, default_currency)
VALUES ('store_loom', 'loom', 'LOOM', 'USD');

INSERT INTO size_charts (id, store_id, unit, note, columns) VALUES
  ('tops','store_loom','cm',
   'Measured flat, garment not body. Chest is measured 2.5cm below the armhole and doubled.',
   ARRAY['Size','Chest','Length','Shoulder','Sleeve']);
INSERT INTO size_chart_rows (chart_id, position, cells) VALUES
  ('tops',0,ARRAY['XS','96','68','43','61']),
  ('tops',1,ARRAY['S','102','70','45','62']),
  ('tops',2,ARRAY['M','108','72','47','64']);

INSERT INTO categories (id, store_id, slug, name, parent_id, blurb) VALUES
  ('cat_knitwear','store_loom','knitwear','Knitwear',NULL,
   'Merino, lambswool, and cotton for the in-between months.'),
  ('cat_knit_sweaters','store_loom','knitwear-sweaters','Sweaters','cat_knitwear',
   'Crews and cardigans.');

INSERT INTO products (id, store_id, slug, title, subtitle, description, details, care,
                      tags, price_amount, price_currency, size_chart_id,
                      rating_average, rating_count, published_at, created_at)
VALUES ('prod_merino','store_loom','merino-crew-knit','Fine Merino Crew',
        '19.5 micron extra-fine merino',
        'Knitted to shape rather than cut from a sheet, so the shoulder seam sits where it should.',
        ARRAY['19.5 micron extra-fine merino','Fully fashioned, 12gg'],
        ARRAY['Hand wash cool','Dry flat'], ARRAY['merino','layering'],
        16800,'USD','tops',4.8,302, now(), '2026-02-14T00:00:00Z');
INSERT INTO product_categories (product_id, category_id)
VALUES ('prod_merino','cat_knit_sweaters');

-- Two images: alt NOT NULL and non-blank. The grid swaps to the second on hover.
INSERT INTO product_images (id, product_id, url, alt, width, height, position) VALUES
  ('img_merino_1','prod_merino','/images/products/merino-crew-knit-1.jpg',
   'Fine Merino Crew in Oat',900,1125,0),
  ('img_merino_2','prod_merino','/images/products/merino-crew-knit-2.jpg',
   'Fine Merino Crew, fabric detail',900,1125,1);

INSERT INTO product_options (id, product_id, name, position) VALUES
  ('opt_merino_color','prod_merino','Color',0),
  ('opt_merino_size', 'prod_merino','Size', 1);
INSERT INTO option_values (id, option_id, value, swatch_hex, position) VALUES
  ('ov_oat','opt_merino_color','Oat','#DCD3C3',0),
  ('ov_charcoal','opt_merino_color','Charcoal','#3A3A3C',1),
  ('ov_s','opt_merino_size','S',NULL,0),
  ('ov_m','opt_merino_size','M',NULL,1),
  ('ov_l','opt_merino_size','L',NULL,2);

-- Six variants: two colours x three sizes.
INSERT INTO variants (id, product_id, sku, price_amount, price_currency, position) VALUES
  ('var_merino_oat_s','prod_merino','MERINO-OAT-S',16800,'USD',0),
  ('var_merino_oat_m','prod_merino','MERINO-OAT-M',16800,'USD',1),
  ('var_merino_oat_l','prod_merino','MERINO-OAT-L',16800,'USD',2),
  ('var_merino_cha_s','prod_merino','MERINO-CHA-S',16800,'USD',3),
  ('var_merino_cha_m','prod_merino','MERINO-CHA-M',16800,'USD',4),
  ('var_merino_cha_l','prod_merino','MERINO-CHA-L',16800,'USD',5);
INSERT INTO variant_option_values (variant_id, option_value_id) VALUES
  ('var_merino_oat_s','ov_oat'),('var_merino_oat_s','ov_s'),
  ('var_merino_oat_m','ov_oat'),('var_merino_oat_m','ov_m'),
  ('var_merino_oat_l','ov_oat'),('var_merino_oat_l','ov_l'),
  ('var_merino_cha_s','ov_charcoal'),('var_merino_cha_s','ov_s'),
  ('var_merino_cha_m','ov_charcoal'),('var_merino_cha_m','ov_m'),
  ('var_merino_cha_l','ov_charcoal'),('var_merino_cha_l','ov_l');
INSERT INTO variant_images (variant_id, image_id) VALUES
  ('var_merino_oat_m','img_merino_1'),('var_merino_cha_m','img_merino_1');

-- Stock arrives as ledger entries, never as an UPDATE. One size stays at zero
-- so the size picker has something to grey out.
INSERT INTO inventory_movements (variant_id, delta, reason, operation_id) VALUES
  ('var_merino_oat_s',4,'receipt','seed:merino-oat-s'),
  ('var_merino_oat_m',6,'receipt','seed:merino-oat-m'),
  ('var_merino_oat_l',2,'receipt','seed:merino-oat-l'),
  ('var_merino_cha_s',3,'receipt','seed:merino-cha-s'),
  ('var_merino_cha_m',5,'receipt','seed:merino-cha-m');

INSERT INTO product_fit (product_id, verdict, feedback_small, feedback_true,
                         feedback_large, sample, note,
                         model_height_cm, model_size, model_label)
VALUES ('prod_merino','true-to-size',6,88,6,302,
        'Fully fashioned, so it holds its shape. Take your usual size.',
        175,'S','5''9"');
INSERT INTO product_fabric (product_id, weight_gsm, weave, origin)
VALUES ('prod_merino',260,'12gg fully fashioned','Biella, Italy');
INSERT INTO product_fabric_composition (product_id, position, material, percent)
VALUES ('prod_merino',0,'Extra-fine merino wool',100);
INSERT INTO certifications (code, label, issuer) VALUES
  ('RWS','Responsible Wool Standard','Textile Exchange'),
  ('OEKO-TEX-100','OEKO-TEX Standard 100','OEKO-TEX Association');
INSERT INTO fabric_certifications (product_id, certification_code) VALUES
  ('prod_merino','RWS'),('prod_merino','OEKO-TEX-100');
COMMIT;

-- Verify: five variants with stock, one sold out, twenty units in total.
SELECT sku, inventory, available FROM variants
WHERE product_id = 'prod_merino' ORDER BY position;
```

If that returns `MERINO-CHA-L | 0 | false` alongside five in stock, the ledger,
the trigger and the generated column are all wired correctly.

---

## MySQL 8 and SQLite

The schema uses PostgreSQL deliberately. Porting is possible; here is what
changes.

| Feature | MySQL 8 | SQLite |
| --- | --- | --- |
| `text[]` (`details`, `care`, `tags`, `columns`, `cells`) | Join table, or `JSON` array | Join table, or `TEXT` holding JSON |
| `jsonb` | `JSON` — no binary index, no GIN | `TEXT` + `json_extract()` |
| `citext` | `utf8mb4_0900_ai_ci` collation on the column | `TEXT COLLATE NOCASE` |
| `CHECK` constraints | Enforced from 8.0.16; **silently ignored before** | Enforced since 3.37 |
| Partial indexes (`WHERE …`) | Not supported — index the whole column, or add a generated boolean and index that | Supported |
| `GENERATED ALWAYS AS … STORED` | Supported | Supported (3.31+) |
| Full-text | `FULLTEXT` + `MATCH … AGAINST`; no weighting | FTS5 virtual table, synced by triggers |
| `DEFERRABLE` constraints | Not supported — renumber positions via a temporary offset | Not supported |
| `timestamptz` | `TIMESTAMP` (UTC in, converts on read); set `time_zone='+00:00'` | `TEXT`, ISO 8601, always UTC |
| `DOMAIN` (`money_minor`) | Inline `INT` and repeat the CHECK | Inline `INTEGER` |
| `RULE` on the ledger | `BEFORE UPDATE`/`DELETE` triggers with `SIGNAL SQLSTATE '45000'` | Trigger with `RAISE(ABORT, …)` |
| `bigserial` | `BIGINT AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| Recursive CTE | Supported (8.0+) | Supported (3.8.3+) |

Two things must not be compromised in either port: **money stays integer minor
units**, and **inventory stays an append-only ledger with a unique
`operation_id`**. Everything else on this page is an implementation detail;
those two are the contract.

SQLite is a reasonable choice for a single-tenant store on one machine and will
be faster than you expect. MySQL is reasonable if it is what your team runs.
Neither is a reason to give up the constraints — reimplement them as triggers
rather than moving them into application code, where they get enforced on one
write path and forgotten on the other.
