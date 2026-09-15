# End-to-end scenarios

The storefront in a real browser (Chromium, via Playwright) against a real Odoo 19 running the
`loom_storefront` addon. One spec per business scenario from the audit checklist (S-1 … S-20):
a guest paying by card, a customer paying cash on delivery, a failed payment retried, stock
running out mid-checkout, two stores on one Odoo, a merchant reading every store tab's preview in
Odoo (S-19), the newer home sections on a computer and a phone (S-20), and so on. Each test checks the business outcome
where it lands — the storefront page, the store API, and the order, delivery, invoice and email in
Odoo — not just that a button was clicked.

It has its own `package.json` so the theme's install stays at three runtime dependencies.

## Reading a run

| Result | Meaning |
| --- | --- |
| passed | The scenario works end to end. |
| expected to fail (`test.fail`) | A known gap blocks it. The `gap` annotation names the gap from `loom-audit/02-gap-report.md` (`#1`, `#14`…, or a §4 P1 item). The body is still the real test. |
| **unexpectedly passed** | A phase fixed that gap. Remove the `.fail` (and the annotation) so the test becomes a regular one. |
| skipped | Odoo-side scenario (S-15 install, S-16 uninstall), covered by the addon's CI install job. |

Where a scenario partly works today (S-4, S-9, S-10, S-13, S-14), the working part is its own
regular test, so a regression there is not hidden behind the expected failure. A test annotated
`new-bug` fails because of a bug the gap report does not list.

The HTML report (`npx playwright show-report`) shows the annotations. Run one scenario with
`npx playwright test --grep @S-7`.

## Running it

Paths assume Odoo checked out next to a virtualenv, as in `~/Work/odoo`: `odoo/` holds `odoo-bin`,
`odoo19.conf` has an `addons_path` that includes the folder containing `loom_storefront`. Adjust to
your layout. The database name and port are what the suite expects by default.

**1. Create the database** (once; no demo data, the default in Odoo 19):

```sh
cd ~/Work/odoo/odoo
../.venv/bin/python ./odoo-bin -c ../odoo19.conf -d loom_e2e_20260913 \
  -i loom_storefront,payment_demo,payment_custom --stop-after-init
```

**2. Seed it.** Idempotent: re-run it any time to reset prices, stock, promotions and settings, for
example after a run you interrupted.

```sh
../.venv/bin/python ./odoo-bin shell -c ../odoo19.conf -d loom_e2e_20260913 --no-http \
  < ../custom_addons/loom_storefront/tools/e2e_seed.py
```

It prints the API base URL (`http://localhost:8074/loom/api/v1/e2e`) and the accounts it created.

**3. Start Odoo on port 8074** and leave it running:

```sh
../.venv/bin/python ./odoo-bin -c ../odoo19.conf -d loom_e2e_20260913 \
  --db-filter='^loom_e2e_20260913$' --http-port 8074
```

**4. Install and run the suite:**

```sh
cd ~/Work/loom-storefront
npm install                      # the dev servers run from the storefront itself
cd e2e
npm install
npx playwright install chromium
npx playwright test              # or, from the storefront root: npm run e2e
```

Playwright starts two Vite dev servers against Odoo — store `e2e` on http://localhost:5174 and
store `e2e-kw` on http://localhost:5175 — with `VITE_DATA_SOURCE=api` and `VITE_API_CACHE=off`.
Locally it reuses servers already listening on those ports; make sure they point at this Odoo.
A full run takes about five minutes. Scenarios run one at a time because they share the database
and some change prices, stock and promotions (always restored in a `finally`).

## What the seed creates

`loom_storefront/tools/e2e_seed.py`, summarised:

- Store `e2e` on the default website: USD, free sign-up, on-site payments, API cache off.
- Store `e2e-kw` on a second website, "E2E Kuwait": KWD pricelist, Arabic default language,
  sign-up left at Odoo's default for a new website (free sign-up once `website_sale` is installed).
- Payments: Demo (test mode), Wire Transfer, Cash on Delivery. Carrier `standard` ($5). Promo
  code `E2E10` (10%).
- Products: `E2E Merino Crew` and `E2E Oxford Shirt` (Colour × Size), `E2E Ceramic Mug` (no
  options, store `e2e` only), `E2E Nova Phone` (Storage × Colour, typed specifications), `E2E Styling
  Session` (service), `E2E Sold Out Lamp` (zero stock), `E2E Hidden Draft` (unpublished), `E2E Oud
  Perfume` (store `e2e-kw` only).
- Accounts: `shopper@e2e.example` / `e2e-shopper-pass`; B2B `buyer@trade.e2e.example` /
  `e2e-trade-pass` (company with a VAT number, 20% trade pricelist); Odoo `admin` / `admin`.

Without `wkhtmltopdf` on the machine, the seed removes the PDF attachment from the order and invoice
email templates and leaves automatic invoicing off. Otherwise Odoo cannot confirm a paid order,
because the confirmation email fails to render. CI installs `wkhtmltopdf` and keeps both.

## Settings

| Variable | Default |
| --- | --- |
| `LOOM_E2E_API` | `http://localhost:8074/loom/api/v1/e2e` |
| `LOOM_E2E_API2` | `LOOM_E2E_API` with the store code `e2e-kw` |
| `LOOM_E2E_ODOO_URL` | origin of `LOOM_E2E_API` |
| `LOOM_E2E_DB` | `loom_e2e_20260913` |
| `LOOM_E2E_ADMIN_LOGIN`, `LOOM_E2E_ADMIN_PASSWORD` | `admin`, `admin` |
| `LOOM_E2E_PORT`, `LOOM_E2E_PORT2` | `5174`, `5175` |
| `LOOM_E2E_STOREFRONT_URL`, `LOOM_E2E_STOREFRONT2_URL` | `http://localhost:<port>` |
| `LOOM_E2E_CRAWL_URL` | the storefront S-12 reads raw HTML from: by default a build of store `e2e` served by the render handler (`support/render-server.mjs`, port `LOOM_E2E_RENDER_PORT`, 5176); point it at a deployment instead |
| `LOOM_E2E_SKIP_WEBSERVER` | `1` to use storefronts you started yourself |

Odoo only answers the storefront origins the seed configured. If you change a port or host, re-run
the seed with the same `LOOM_E2E_STOREFRONT_URL` / `LOOM_E2E_STOREFRONT2_URL` (and
`LOOM_E2E_ODOO_URL`) in the environment, or add the new origins to each store's **Extra origins**
(Advanced tab).

When 5174 and 5175 are busy with other storefronts, start store `e2e` yourself on a free port and
point the suite at it:

```sh
cd ~/Work/loom-storefront
VITE_DATA_SOURCE=api VITE_API_BASE_URL=http://localhost:8074/loom/api/v1/e2e VITE_API_CACHE=off \
  node node_modules/vite/bin/vite.js --config e2e/support/vite.config.mjs --port 5177 --strictPort &
cd e2e
LOOM_E2E_SKIP_WEBSERVER=1 LOOM_E2E_PORT=5177 LOOM_E2E_PORT2=5178 npx playwright test --grep @S-20
```

## Layout

```
e2e/
  playwright.config.js   dev servers, one worker, Chromium
  support/
    env.js               settings above
    fixtures.js          test + shop / odoo / store / store2 fixtures, gaps() annotations
    shop.js              the shopper: roles and labels, not CSS classes
    odoo.js              the merchant: JSON-RPC as admin (prices, stock, invoices, refunds)
    store-api.js         store API for preconditions and reading outcomes
    html.js              what a crawler reads from raw HTML
    global-setup.js      fails fast when Odoo or the seed is missing
    vite.config.mjs      the storefront's Vite config with a per-server cache
  tests/s01-…s20-*.spec.js
```

Merchant actions go through Odoo's JSON-RPC (`/web/session/authenticate`, then
`/web/dataset/call_kw`), never through Odoo's UI. The behaviour under test always goes through the
storefront in the browser.

## CI

`.github/workflows/e2e.yml` runs this nightly and on demand. It checks out Odoo 19.0 and the addon
repository (the `LOOM_ADDON_REPOSITORY` variable or the `addon_repository` input; add a
`LOOM_ADDON_TOKEN` secret if it is private), creates and seeds the database, starts Odoo, and uploads
the Playwright report.
