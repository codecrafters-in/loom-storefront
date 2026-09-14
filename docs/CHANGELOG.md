# Changelog

Newest first. Each entry links to the page with the detail.

## What's new — 2026-09-14

### Any product, not just apparel

- **One picker for every product.** Options render as the store set them up in
  Odoo (swatches, image tiles, pills, radios or a select), whatever they are
  called. Choices are available, sold out (struck through), never made in that
  combination (dashed) or not yet made on a dynamic option, and the button says
  what is missing ("Select storage"). Products with no options are buyable.
  The gallery follows whichever option has `imagesFollow`; the size chart and
  the fit block appear only where an option has `role: 'size'`.
  [API.md](API.md#any-product)
- **Dynamic options and extras.** Combinations missing from `variants[]` and
  no-variant extras (an engraving, a gift box) are priced by the new
  `POST /products/:slug/combination`. Extras render as radios or checkboxes, a
  custom choice opens a text field (200 characters), and the bag takes
  `{ product_slug, choice_ids, extra_choice_ids, custom_values, quantity }`.
  A backend without choice ids still gets `{ variant_id, quantity }`.
  [API.md](API.md#cart)
- **Quantity rules and stock wording.** The product and bag steppers follow
  `quantity.{min, max, step, unit, decimals}` (coffee by the quarter kilo), and
  stock follows `stock.display`: the number, "Only N left" under the threshold,
  or never a number. [API.md](API.md#any-product)
- **Sets, optional products and accessories.** A combo product gets a set
  configurator (one item per group, extra price shown, total). Optional
  products are offered in a dialog as the product is added and ride on the same
  request, linked to its line; the bag shows them indented under it. Accessories
  are a "Frequently bought together" rail on the product page and in the bag
  drawer; alternatives feed "You might also like". Bag lines show extras, typed
  text and a set's contents everywhere a line is shown. [API.md](API.md#cart)
- **Brands, downloads and quick view.** `/brands` lists every brand with a
  product, brand pages are prerendered and scoped with `in_brand` (their filters
  describe that brand only), quick view offers the optional products too, and a
  signed-in customer's downloads are fetched with their token, so they keep
  working after the 30-day guest order link expires (`downloadFile`).
- **Filters for any catalogue.** The filter panel renders every attribute,
  specification facet and brand the backend sends (`attr=`, `spec=`, `brand=`,
  kept in the URL), and the price filter has a lowest and a highest end in the
  store's currency. [API.md](API.md#get-products)
- **Brands, specifications, films.** Brand name or logo on cards and product
  pages, a `/brands/:slug` page, and the brand in Product JSON-LD. Specifications
  and tab names come from the store (`enrichment.specList`, `enrichment.labels`).
  YouTube and Vimeo films are a poster until pressed, then play from the
  privacy-enhanced hosts, which the Content-Security-Policy now allows as frames.
  [API.md](API.md#any-product) · [CONFIGURATION.md](CONFIGURATION.md#content-security-policy)
- **Categories at any depth.** Category pages and breadcrumbs use names from
  `breadcrumbs` and category `path`, to any depth; a third-level page no longer
  calls itself "All products". [API.md](API.md#get-categories)
- **Compare and quick view.** Compare up to four products at `/compare?slugs=`,
  with a specification table, and look at a product from the grid without
  leaving it. Both load only when used.
- **Downloads.** A paid order with a digital product lists its files on the
  order page. [API.md](API.md#orders-and-account)
- **The demo sells more than clothes.** A phone (Storage × Color, a combination
  never made, a film, an optional case), a notebook with no options, a pen with
  an engraving, coffee by weight with a dynamic grind, a desk set and a
  downloadable handbook, under a three-level Goods category.
- **Neutral wording.** "Pieces" is "products" or "items", and the search hint,
  the tag filter and the option names no longer assume clothing.
- **A smaller first download.** The build now knows which data layer it talks
  to and leaves the other adapter out, so a live store no longer downloads the
  demo backend and the demo no longer downloads the HTTP client.
  [PERFORMANCE.md](PERFORMANCE.md)

### Security

- **Admins sign in with Odoo, not on the shop.** In api mode the admin login page
  is one **Sign in with Odoo** button: the password and two-factor code are typed
  on Odoo's own page, and the browser comes back to the new `/admin/callback`
  route with a one-time code, traded with a PKCE verifier at
  `POST /admin/auth/token`. The password form is gone, and
  `POST /admin/auth/login` now refuses passwords (`403 odoo_sign_in_required`);
  scripts use an Odoo API key. The demo keeps its `admin` / `admin` form.
  [ADMIN.md](ADMIN.md#authentication)
- **Admin sessions renew themselves.** The access token lasts about an hour and
  is refreshed before it runs out, or once after a 401. Refresh tokens rotate;
  tabs take turns so none is ever spent twice, which the server would treat as
  theft. Sign-out revokes the refresh token too.
  [ADMIN.md](ADMIN.md#authentication)
- **Captcha, when the store switches it on.** `security.captcha` in the settings
  document turns on Cloudflare Turnstile or Google reCAPTCHA v3 for sign-in,
  registration, order lookup and the newsletter, which then send `captchaToken`.
  Off, nothing loads. [API.md](API.md#captcha)
- **A Content-Security-Policy on every built page.** `npm run build` now ends
  with `scripts/csp.mjs`: scripts only from the site, its own hashed inline
  scripts, the known payment providers and only the captcha paths of Cloudflare
  and Google (their other scripts are known ways around a policy); API calls
  only to the configured backend. [CONFIGURATION.md](CONFIGURATION.md#content-security-policy)
- **The shop can no longer be framed.** `frame-ancestors 'none'` and
  `X-Frame-Options: DENY` in `vercel.json` and `public/_headers`.

### Removed

- **`VITE_API_TOKEN`.** It was sent in place of the signed-in customer's token,
  which silently broke sign-in. Delete it from `.env.local` and your host.
  [CONFIGURATION.md](CONFIGURATION.md#environment-variables)
- **Cookies on API requests.** No request sets `credentials: 'include'` any more;
  auth is the `Authorization` header alone, and the backend no longer sends
  `Access-Control-Allow-Credentials`. [API.md](API.md)

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
