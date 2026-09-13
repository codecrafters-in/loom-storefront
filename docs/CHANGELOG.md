# Changelog

Newest first. Each entry links to the page with the detail.

## What's new — 2026-09-12

### Fixes

- **A payment could be lost when confirming the order failed.** The Odoo module
  now keeps a recorded payment if confirming, invoicing or emailing fails, and
  answers `paid` with `order: null` and a "Payment received…" message while it
  retries. The checkout keeps polling and shows that message.
  [API.md](API.md#on-site-payments) · [CHECKOUT.md](CHECKOUT.md) · backend rule 7
  in [INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md)
- **A bought item stayed in the bag.** A signed-in customer could own two open
  bags (a guest bag claimed on sign-in while the account already had one); after
  paying one, `POST /carts` handed back the other. The theme now asks for
  `POST /carts {"fresh": true}` right after a bag becomes an order, and the
  backend merges a customer's bags when a guest bag is claimed (higher quantity
  wins, never the sum). [API.md](API.md#who-owns-a-bag)
- **Awaiting payment showed a count over an empty list.** Its count included
  orders with no payment recorded, while the tab listed only `pending` ones. The
  tab now asks for `payment=awaiting` (pending **or** unpaid, not cancelled), and
  every tab count is defined as the total of its own filter.
  [API.md](API.md#admin-orders) · [ADMIN.md](ADMIN.md)

### Checkout and payments

- **`payments` checkout mode.** The backend lists its own payment methods and
  the shopper pays on the checkout page: offline methods, saved methods, an
  on-page form or modal (the demo card, Razorpay), or the gateway's hosted page
  for gateways that only have one. New routes: `POST /carts/:id/payment-options`,
  `POST /carts/:id/payments`, `POST /payments/:id/actions/:action`,
  `GET /payments/:id`. [CHECKOUT.md](CHECKOUT.md) · [API.md](API.md)
- **`/checkout/return`** picks a shopper up after a hosted payment page and opens
  the order, or returns to checkout with the reason.
- **Gateway drivers** live in `src/lib/payments/drivers/`; adding a gateway is one
  file. [CHECKOUT.md](CHECKOUT.md)
- **State / region follows the country.** `GET /countries/:code` lists a country's
  states; checkout and the address book show a dropdown when it does and a text box
  when it does not. Refused addresses name the field. [API.md](API.md) ·
  [DATA-MODEL.md](DATA-MODEL.md)

### Customer account

- **`/account` redesigned.** An overview with the latest order, personal details
  (edited in place), the default address and saved items; order cards; address
  cards with Edit, Set as default and Remove. [USER-GUIDE.md](USER-GUIDE.md)
- **The address form asks for country, state and phone**, which the backend needs.

### Admin panel

- **Unsaved product edits survive a reload**, with a restore / discard bar.
  [ADMIN.md](ADMIN.md)
- **Highlights and specifications stay in sync**; number attributes say they take
  a number; slug rules are checked as you type; a failed save opens the tab to fix.
- **Orders are back, in both modes.** Tabs for To ship, Awaiting payment, Shipped,
  Delivered and Cancelled; an order page with progress, items, customer, payment and
  delivery; **Mark as shipped** with carrier, tracking number and link, **Mark as
  delivered**, **Record cash received** for cash on delivery, and **Cancel order**.
  New `GET /admin/orders` and the `PATCH /admin/orders/:id` actions. The shopper's
  order page follows: *On its way* with a Track parcel button, then *Delivered*.
  [ADMIN.md](ADMIN.md) · [API.md](API.md) · [USER-GUIDE.md](USER-GUIDE.md)
- **Against a real backend:** uploads only (JPEG, PNG, WebP, GIF), derived fields
  read-only, only the `new` and `bestseller` badges editable, and Discounts,
  Storefront and Import / export hidden. Load errors show with a retry button.
- **Variants:** editing colours or sizes keeps other options; removing a value
  removes its rows; size-only and colour-only products can add rows.
- **`GET /admin/categories`** lists every category, empty ones included, for the
  Categories screen and the Organise tab.
- **Round-trip rules for backends** are written down: what the admin read must
  return, and what a save may and may not change. [ADMIN.md](ADMIN.md)

### Documentation

- **API.md opens with an endpoint index** — every route, what the request must
  carry, and whether it may be cached. [API.md](API.md)
- **The backend and database prompts cover the new contract**: on-site payments,
  countries and states, admin orders and fulfilment, and the admin round-trip
  rules, with new non-negotiable rules on payments, idempotency and order
  transitions. [INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md) ·
  [SCHEMA-PROMPT.md](SCHEMA-PROMPT.md)
- **DATABASE.md** gains payment methods, payment tokens and processing,
  shipments, countries and states, and the view that derives payment and delivery
  status with one-scan tab counts. [DATABASE.md](DATABASE.md)
- **DATA-MODEL.md, ERRORS.md and TESTING.md** document PaymentMethod, Payment
  and AdminOrder, every payment and fulfilment error code, and how to check
  payments, fulfilment and addresses by hand. [DATA-MODEL.md](DATA-MODEL.md) ·
  [ERRORS.md](ERRORS.md) · [TESTING.md](TESTING.md)

### Storefront

- **Submenus take hand-added links** (`{ label, to }`) as well as categories.
  [CONFIGURATION.md](CONFIGURATION.md)
- **`VITE_API_CACHE=off` is browser-only.** Server rendering and the prerender
  always cache, which fixes product pages prerendering without a title when the
  flag was off. [CONFIGURATION.md](CONFIGURATION.md)
