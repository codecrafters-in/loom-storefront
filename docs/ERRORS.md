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
| `invalid_address` | 422 | The fields named in `detail.fields` are marked on the checkout and account address forms, with the message |
| `choose_options` | 422 | Adding to the bag with an option not chosen. Toast: "Choose Storage first.", from `detail.missing` when the body has no message |
| `invalid_combination` | 422 | A combination that is excluded or not made, or text over 200 characters. The buy button reads "Not available"; the add is refused with a toast |
| `quantity_rule` | 422 | A quantity outside the product's `quantity` rule. Toast built from `detail.min`, `detail.max`, `detail.step`; the steppers only offer allowed quantities |
| `combo_incomplete` | 422 | A set added without one item from every group. Toast names `detail.groups` |
| `captcha_failed` | 422 | Inline on the form that sent it — sign-in, registration, order lookup, newsletter — and the captcha is reset for another try |
| `invalid_grant` | 400 or 401 | Admin sign-in: shown on the admin login page. From a refresh, the panel signs out |
| `invalid_request` | 400 | Admin sign-in: shown on the admin login page |
| `odoo_sign_in_required` | 403 | `POST /admin/auth/login` was sent a password. The panel never does this; a script should send an API key |

### Payments

The `payments` checkout mode. Flows in [CHECKOUT.md](CHECKOUT.md), routes in
[API.md](API.md).

| Code | Status | Where it surfaces |
| --- | --- | --- |
| `no_payment_methods` | 422 | Payment step: nothing the backend offers can take this cart to this address |
| `invalid_payment_method` | 422 | The chosen method or saved card cannot pay this order; pick another |
| `cart_changed` | 409 | The total moved since the methods were listed; options are fetched again |
| `payment_in_progress` | 409 | A payment for this bag is under way (another tab, or a gateway page left open); the bag shows **Cancel payment** |
| `already_paid` | 409 | The bag was paid already; the order opens |
| `checkout_in_progress` | 409 | The bag is being checked out in another tab; try again in a moment |
| `invalid_reward` | 422 | The reward cannot be claimed for this bag; toast |
| `invalid_slugs` | 422 | Merging a guest's saved items sent something other than a list of up to 100 slugs; kept for the next sign-in |
| `pickup_location_required` | 422 | The in-store delivery method has no shop chosen yet; checkout shows the shop list |
| `invalid_pickup_location` | 422 | That shop does not collect for this method; the list reloads |
| `pickup_unavailable` | 404 | The backend has no click & collect; the method should not have been offered |
| `slot_required` | 422 | The delivery method needs a slot (`detail.fields: ["delivery_slot"]`); focus moves to the slots |
| `slot_unavailable` | 409 | The slot filled up while the shopper was checking out; they choose another |
| `minimum_not_met` | 409 | The bag is under the store's minimum order (`detail.minimum`, `detail.remaining` in minor units); checkout says how much more |
| `terms_required` | 422 | The store requires the terms box (`detail.fields: ["accept_terms"]`); focus moves to it |
| `nothing_to_pay` | 409 | Pay now on an order that is already paid; the page reloads the order |
| `nothing_to_refund` | 409 | Admin refund on an order with nothing left to refund |
| `refund_in_odoo` | 409 | The payment cannot be refunded from the admin; the message says to use Odoo |
| `refund_failed` | 409 | The payment provider refused the refund; its message is shown |
| `invalid_signature` | 403 | A gateway result that failed verification; the payment does not count |
| `unsupported_action` | 404 | A gateway step this payment does not take |
| `invalid_outcome` | 422 | Demo card only: no test outcome was chosen |
| `retry` | 409 | Not a failure — polling asks again |

### Admin orders

`PATCH /admin/orders/:id` and the order screens in `/admin`.

| Code | Status | Where it surfaces |
| --- | --- | --- |
| `not_found` | 404 | The order page shows an empty state |
| `not_allowed` | 403 | Inline on the card: this user may not change orders or deliveries |
| `action_not_allowed` | 409 | The order moved on since it was loaded; its actions come from the answer |
| `cannot_ship` | 409 | Inline on the Delivery card, with the backend's reason |
| `not_shipped` | 409 | Tracking can only be updated once the order has shipped |
| `already_shipped` | 409 | A shipped order can no longer be cancelled |
| `nothing_to_record` | 409 | No offline payment is waiting to be recorded |
| `invalid_action` | 422 | The request named none of the five actions |
| `invalid_tracking` | 422 | Inline under the tracking fields: the link must be `http(s)://`, the number at most 128 characters |
| `invalid_filter` | 422 | `GET /admin/orders` got an unknown filter value; the message lists the accepted ones (`payment` also takes `awaiting`) |

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
| `payment_cancelled` | The shopper closed the gateway's window | Nothing to fix — shown as a notice, and the bag is unchanged |
| `payment_failed` | The gateway refused the payment in its own window | Nothing to fix — the shopper can pick again |
| `payment_unsupported` | A `direct` method with no storefront driver | Add a driver in `src/lib/payments/drivers/`, or offer the method as `redirect` |
| `payment_no_redirect` | `flow: "redirect"` with no `redirect.url` | Return `{ "redirect": { "url": "https://…" } }` |
| `payment_misconfigured` | The gateway values a driver needs are missing, such as Razorpay's key or order id | Fill `client` on the create response |
| `captcha_unavailable` | The captcha provider's script did not load | A content blocker, or a Content-Security-Policy without the provider's domain — see [CONFIGURATION.md](CONFIGURATION.md#content-security-policy) |
| `captcha_pending` | Submitted before Turnstile finished its check | Nothing to fix — the shopper tries again a moment later |
| `insecure_context` | Sign in with Odoo on a page that is neither https nor localhost | The browser only offers the crypto PKCE needs on secure pages. Open the store over https |
| `not_odoo` | `VITE_API_BASE_URL` has no `/loom/api/v1/<store>` segment | Point it at the store API, so the sign-in knows which Odoo and which store |
| `invalid_state` | The admin callback's `state` did not match the one this tab saved | Nothing to fix — start the sign-in again, in one tab |

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
