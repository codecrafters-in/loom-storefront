# Testing

```
npm test           # once
npm run test:watch # on change
npm run build      # docs → tests → build; a failing test fails the build
```

Two hundred-odd tests, no test framework. `node --test` is already in Node, and a theme that
ships three runtime dependencies should not quadruple its install to check
arithmetic. Node runs each **file** in its own process, so every file gets a
clean database singleton for free — which is what makes the migration and
cross-tab tests possible at all.

## The browser, in 60 lines

`test/helpers/browser.mjs` puts `localStorage`, `sessionStorage` and a `window`
that dispatches `storage` events onto `globalThis`. Two details do the real work:

- **Import it before any app module.** ES imports are hoisted, so app modules
  must come in through `await import()` afterwards. `loadApp()` does that.
- **`localStorage` is shared and `sessionStorage` is not**, exactly as in a
  browser. That asymmetry is the only reason a single process can play "the
  other tab" convincingly.

`settle()` waits 900ms because the mock adapter simulates 220ms of latency on
every call, deliberately — without it no loading state is ever exercised. Three
cross-tab tests failed first time against a 30ms wait, and the tempting fix was
to change the code rather than the wait.

## What is covered

| File | What it protects |
| --- | --- |
| `money` | Minor units, the two-decimal round trip, the 5% sale threshold |
| `catalog` | Every product enriched, regions agreeing, a photograph per colour, the image strip never empty |
| `pricing` | Per-variant prices, ranges before a size is chosen, overrides surviving a repricing |
| `cache` | De-duplication, stale-while-revalidate, revalidation reaching the caller, namespace purges |
| `cross-tab` | A write in one tab reaching another: catalogue, settings, bag, hearts, sign-out |
| `migration` | A store several versions behind gaining new fields without losing edits |
| `account` | Register → buy → order history → sign out, and orders not leaking between accounts |
| `library` | Attributes learned from products, blocks saved explicitly, kinds validated |
| `adapters` | Both adapters implementing the same surface, read from source |
| `ui-logic` | The specification editor, delivery tokens, lightbox zoom and pan |
| `payments` | Overselling, the refund ledger, the write-only credential store |
| `reference-server` | Signature verification, webhooks and admin auth, over HTTP |
| `prerender` | What `dist/` actually contains after a build |
| `analytics` | Consent, Do Not Track, event shapes, and staying silent by default |
| `images` | Every srcset candidate existing, and being smaller than its source |
| `error-boundary` | The reset, which is the part that fails silently |
| `order-lookup` | Both fields matching, and failing identically when they do not |
| `seo` | robots.txt and the sitemap, by running the scripts for real |
| `recently-viewed` | Per-customer scoping, the sign-in merge, corrupt storage |
| `orders` | Server-side placement, idempotent replays, admin vs owner scoping |
| `gates` | The contrast formula, and the budget measuring the real initial download |
| `payments-onsite` | Method routing, polling that backs off and gives up, the demo and Razorpay drivers, and the demo backend end to end |
| `admin-orders` | Shipping with tracking reaching the shopper, delivery, cash on delivery, cancelling returning stock, filters and counts |
| `admin-editor` | Slug rules while typing, highlights and specifications staying in sync, the admin category list |
| `regions` | `getCountry` listing states, and the empty list that keeps a text box |
| `prefill` | A refreshed checkout filling the default address without overwriting what was typed |

## Checking payments, fulfilment and addresses by hand

The suite covers the logic. These confirm the wiring against a real backend.

**On-site payments** (`checkout.mode: "payments"`):

1. **Demo card.** Pick the test card and try each outcome. *Paid* opens the
   order; *Pending* opens it with the payment pending; *Cancelled* and *Declined*
   return to checkout with the bag unchanged.
2. **Cash on delivery.** The order opens straight away with the payment pending.
3. **Razorpay in test mode.** Use Razorpay's test keys and test card or UPI id.
   The order appears only after the backend verifies the signature — post a
   tampered `razorpay_signature` to `POST /payments/:id/actions/complete` and
   expect `403 invalid_signature`.
4. **A hosted payment page.** Come back from it and confirm `/checkout/return`
   opens the order, and that a cancelled attempt returns to checkout with the
   reason.
5. **A changed bag.** Change the bag in another tab between listing methods and
   paying, and expect `409 cart_changed` and fresh options.

**Fulfilment** (`/admin/orders`):

1. A paid order sits under **To ship**. Mark it shipped with a carrier, tracking
   number and link; the shopper's order page shows *On its way* and **Track
   parcel**.
2. Update the tracking, then **Mark as delivered**; the shopper's page shows
   *Delivered*.
3. A cash on delivery order: ship it, then **Record cash received** — the payment
   turns paid.
4. Cancel an unshipped order and confirm its stock came back; cancelling a
   shipped one must be refused.

**The bag after an order.**

1. Sign in, add an item and pay. The header bag is empty on the order page and
   after a reload.
2. Sign out, add an item as a guest, sign back in on the same browser while your
   account already had a different item in its bag. The bag now holds both
   items, once each — an item in both bags keeps the higher quantity, not the
   sum.

**Addresses.** Pick India or the United States at checkout and in the address
book — State / region is a dropdown; pick France — it is a text box. Save an
address without a required state and expect that field marked, not a generic
error.

[CHECKOUT.md](CHECKOUT.md) covers testing the older `redirect` contract.

## Two rules that make it worth having

**Never copy a list the code already owns.** `adapters.test.mjs` parses
`SURFACE` out of `src/lib/api/index.js`. The first version hand-copied it and was
missing fifteen names — a hand-maintained duplicate of a list is a list that is
wrong.

**Never extract a calculation you are testing.** `pricing.test.mjs` reads the
`shown` price calculation out of `ProductView.jsx` and evaluates it. A copy
would keep passing after the real one broke, which is precisely the bug it
exists to catch.

## Proving the suite is not decorative

A passing suite proves nothing on its own. Eight known regressions were
reintroduced one at a time and all eight failed the suite:

| Regression | |
| --- | --- |
| Variant price stops cascading correctly | caught |
| The 5% sale threshold is removed | caught |
| A cross-tab write stops invalidating the cache | caught |
| Revalidation stops waking listeners | caught |
| Order history ignores the session again | caught |
| Backfill goes back to a shallow merge | caught |
| The library stops learning attributes | caught |
| Variants point at one shared image again | caught |

Worth repeating whenever a test is added: break the thing it claims to protect
and confirm it goes red.

## What is not covered

**`prerender` asserts output, not code.** It skips when `dist/` is missing, so
`npm run build` removes it first — otherwise the pre-build run would assert the
*previous* build and pass while the new one was broken. The pass after the build
is where those nine run.

**No rendering tests.** The error boundary's two decisions were pulled into
`src/lib/errors.js` so they could be tested at all — Node cannot import `.jsx`,
and mounting a component properly means a DOM and a testing library. The logic
is covered; the markup is not. Nothing here mounts a component, so a broken layout, an
unreadable contrast pairing or a button that does not respond to a click will
pass. The logic behind the components is tested; the components are not. Adding
that means jsdom and a testing library, which is a real cost against three
runtime dependencies — worth paying when the first layout regression ships, and
not before.

**No integration test against a real backend.** `http.js` is checked for shape,
never for behaviour. The reference payments server *is* run for real, but
against forged signatures rather than Razorpay's — the crypto is verified, the
provider round trip is not.
