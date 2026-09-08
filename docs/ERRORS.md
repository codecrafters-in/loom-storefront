# Errors

Two kinds, and they are worth telling apart.

**`ApiError`** — the request failed, or the server said no. Carries `status`,
`code` and `message`. `message` is shown to the shopper.

**`ContractError`** — the request succeeded and the body was the wrong shape.
Never shown to a shopper; it names the endpoint and the field so you can fix it.

---

## Error responses

Return the HTTP status plus:

```json
{ "message": "Only 2 left in that size.", "code": "insufficient_inventory" }
```

`message` is rendered verbatim in toasts and inline on checkout — write it for
the person buying, not for your logs. `code` is what you branch on.

---

## Codes the theme knows

| Code | Status | Where it surfaces |
| --- | --- | --- |
| `not_found` | 404 | Product page shows an empty state, not an error |
| `variant_not_found` | 404 | Toast |
| `out_of_stock` | 409 | Toast; size stays disabled |
| `insufficient_inventory` | 409 | Toast, and inline at checkout |
| `invalid_discount` | 422 | Inline under the code field |
| `empty_cart` | 422 | Checkout redirects to an empty state |
| `unauthenticated` | 401 | **Expected when signed out.** Silently ignored on `GET /me` |
| `invalid_credentials` | 401 | Inline on the sign-in form |
| `missing_credentials` | 422 | Inline |
| `invalid_email` | 422 | Inline on the newsletter field |

Anything else is shown with its `message` and treated as a generic failure.

---

## Codes the theme generates

These mean the integration is wrong, not the request.

| Code | Cause | Fix |
| --- | --- | --- |
| `network_error` | Request never reached the server | Almost always CORS or a wrong `VITE_API_BASE_URL`. The browser will not tell you which — check the server sends `Access-Control-Allow-Origin` for this origin and allows `Authorization` |
| `timeout` | No response within `VITE_API_TIMEOUT` | Raise it, or fix the endpoint |
| `bad_response` | 200 with a body that is not JSON | Usually an HTML error page from a proxy |
| `contract_violation` | 200 with the wrong shape | Read the message — it names the field |
| `checkout_misconfigured` | `checkout.mode` is not `demo` but `createUrl` is empty | Set `checkout.createUrl` |
| `checkout_no_redirect` | `redirect` mode; response had no `url` | Return `{ "url": "https://…" }` |
| `checkout_no_order` | `api` mode; response had no `id` | Return an `Order` |

---

## Reading a ContractError

```
GET /products items[3].price did not match the API contract —
expected Money { amount:int, currency:string }, got object{value,ccy}.
See docs/API.md.
```

It tells you the endpoint, the index, the field, what was expected and what
arrived. **Read this before opening the network tab** — it is faster than
diffing payloads by eye, and it is the reason validation happens at the
boundary rather than wherever the value is finally used.

The checks that run:

| Endpoint | Asserted |
| --- | --- |
| `GET /products` | `{ items: [], total: number }`, then every item as a Product |
| `GET /products/:slug` | `id` `slug` `title` non-empty, `price` is Money, at least one image, at least one variant |
| `GET /carts/*` | `id` string, `lines` array, `subtotal` and `total` are Money |
| Any list endpoint | `{ items: [], total: number }` |

The most common real-world failures, in order:

1. **Money as a float or a string.** `12.80` or `"$128.00"` instead of
   `{ amount: 12800, currency: "USD" }`.
2. **`items` at the top level** instead of `{ items, total }`.
3. **`variants: []`** on a product that is out of stock. Return the variants
   with `available: false` — an empty array means the page has no size picker
   and nothing to add.
4. **`alt` missing on images.** Not fatal, but it is an accessibility bug and
   the contract asks for it.

---

## Debugging checklist

Nothing renders and the console is quiet:

1. Is `VITE_DATA_SOURCE` set to `api`? Restart the dev server after changing
   `.env.local` — Vite reads env at boot, not per request.
2. Is `VITE_API_BASE_URL` right, with no trailing slash?
3. Does `GET {base}/products` work in `curl`? If yes and the browser fails, it
   is CORS.

Products load but the cart does not:

1. `POST /carts` must return a `Cart` with an `id`.
2. The theme stores that id in `localStorage` under `loom.cart_id`. Clear it if
   you have switched backends.
3. `GET /carts/:id` returning 404 is handled — the theme creates a new cart. Any
   other status is not.

The home page is blank:

`GET /storefront` returned `home: []`. An empty array means "no sections", which
is a valid answer. Omit the key entirely to keep the defaults.
