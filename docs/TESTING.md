# Testing

```
npm test           # once
npm run test:watch # on change
npm run build      # docs → tests → build; a failing test fails the build
```

81 tests, no test framework. `node --test` is already in Node, and a theme that
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

**No rendering tests.** Nothing here mounts a component, so a broken layout, an
unreadable contrast pairing or a button that does not respond to a click will
pass. The logic behind the components is tested; the components are not. Adding
that means jsdom and a testing library, which is a real cost against three
runtime dependencies — worth paying when the first layout regression ships, and
not before.

**No integration test against a real backend.** `http.js` is checked for shape,
never for behaviour. Until it has been run against a server, "works with your
API" is a design rather than a fact.
