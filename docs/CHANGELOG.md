# Changelog

Newest first. Each entry links to the page with the detail.

## What's new — Phase 12: returns by rules, answered cancellations and order messages

For the Odoo backend's rules-based returns, cancellation requests and customer-visible order messages. Details:
[API.md](API.md#after-the-order), [ADMIN.md](ADMIN.md) and [USER-GUIDE.md](USER-GUIDE.md#answer-a-request-to-cancel).

- **Discount codes at checkout:** the checkout summary has the discount code box (apply and remove), not only the full bag page; applying a code after the payment step opened prepares the payment again for the new total.
- **Order page › Returns:** the order's returns (`returnCount`) as cards with their status and what happens next —
  approved and how to send the items back, a refund on its way, or the amount refunded (`refunded`). **Return items**
  opens the form.
- **Return form:** each line's last day when the windows differ (`lines[].until`), items that cannot go back greyed
  with *Final sale* or the day their window ended (`unavailable`), a hint when a reason is always reviewed
  (`needsReview`), and a line before sending on approval and refund timing (`approval`, `refundTiming`). A return the
  store approves or refunds straight away says so.
- **Cancellation requests:** the order page says a request is waiting (`cancelRequest`), and shows the store's answer
  when it is declined. **Storefront admin › Orders** answers it with **Accept and cancel** or **Decline**
  (`accept_cancel`, `decline_cancel`).
- **Order messages:** the conversation with the store on the order page (`messages`), and replies with
  `POST /orders/:id/messages` (`sendOrderMessage`). Left out when the store keeps messages off.
- **Account › Returns:** the same explanation and the refunded amount on every return.
- **Product pages:** a product's own returns policy (`product.returns`): *Final sale* for an item that cannot be
  returned, and its own number of days otherwise.
- **Storefront admin › Products follows the product type.** A product's type is its Odoo product category
  (`productTypeId`, `productType`), chosen at the top of **Details**. Its blocks decide the editor: the fit, size chart
  and composition panels appear only where the type has them, in a tab named for what it holds (*Fit, size & fabric*,
  *Materials*, *Ingredients*), with the type's words and weight unit; manufacturer rows only where it asks for
  compliance (or the product already has some); and the preview shows the same blocks. Changing an existing product's
  type asks first, naming the specifications it would lose. [ADMIN.md](ADMIN.md#products-and-their-type)
- **Options of any name.** The Variants tab edits any options (Weight, Grind, Finish, Length…) with suggestions from
  what the store already uses (`GET /admin/library` → `options`), swatches only for a colour option, and missing
  combinations, *Add all* and bulk actions for any number of options. A new product starts with no options, or empty
  Colour and Size for a type that is worn and sized. Specification suggestions put the type's own keys first
  (`productType.specKeys`). [USER-GUIDE.md](USER-GUIDE.md#add-a-product)
- **Size charts only where they are used.** The admin menu offers *Size charts* only when a product type has one
  (`productTypes[].blocks.sizeChart`); the inventory search matches any option value.

## What's new — Phase 11: ready for the App Store

For the Odoo backend's version 19.0.2.0.0. Details: [CHECKOUT.md](CHECKOUT.md), [ERRORS.md](ERRORS.md) and
[API.md](API.md).

- **README:** an **Odoo backend** section: where the module comes from, which Odoo it needs and how to connect.
- **Checkout without an address:** when nothing in the bag ships (`cart.requiresShipping === false`), checkout asks
  for a name and email only, with no delivery step.
- **Abandoned-cart links:** a registered customer's bag asks them to sign in first (`sign_in_required`), then comes
  back; the message is translated in every language the theme ships.
- **Admin tour:** on a live store the third card points to **Import / export** instead of the demo's note.

## What's new — Phase 10: the admin on Odoo, cache purge and visit counts

Screens and calls for what the Odoo backend added in its Phase 10. Details: [ADMIN.md](ADMIN.md#the-write-api) and
[DEPLOY.md](DEPLOY.md#settings).

- **The storefront admin against Odoo:** **Discounts** (codes and automatic promotions with a minimum, dates and a
  usage limit; programs it cannot edit open in Odoo), **Storefront** (the settings Odoo lets it change, with a link
  for the rest, a test email and where keys are kept), **Import / export** (a CSV with one row per variant, or JSON,
  checked before anything is saved), **Orders › New order** (phone and email orders with a payment link, already
  paid, or a quotation), **Returns** and **Reviews & questions**, and Overview cards for the last 30 days and what is
  waiting.
- The back office's API calls load with its first use (`src/lib/api/http-admin.js`), which also leaves room in the
  first download.
- **Product editor:** the Fit & fabric tab shows for clothing only (the demo, stores with size charts, products that
  have fit or fabric); specifications come from the category.
- **Render handler:** `POST /__loom/revalidate` takes Odoo's signed `content.changed` and `product.changed` webhooks,
  clears its cache and purges Cloudflare (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`) or forwards to
  `LOOM_PURGE_URL`. Set `LOOM_WEBHOOK_SECRET`.
- **Visit counts:** a visit per browser session, product views, adds to the bag and checkouts started go to
  `POST /events` for Odoo's dashboard, with no cookie and nothing identifying the visitor. Do Not Track and
  `analytics.countVisits: false` switch it off.
- e2e **S-18**: the storefront admin runs on Odoo.

## What's new — Phase 9: accounts, after the order, reviews and more

Pages and calls for what the Odoo backend added in its Phase 9. Details: [API.md](API.md#accounts-and-sign-in).

- **Password and invitation links:** `/forgot-password`, `/reset-password`, `/create-account`, `/verify-email`,
  `/confirm-email`; a banner asks an unverified customer to confirm their email.
- **Account › Sign-in & privacy:** change password and email, download my data, close the account.
- **Sign in** with a text-message code (`features.phoneLogin`) or a provider (`features.socialLogin`, back at
  `/login/oauth`); business details and newsletter consent at sign-up.
- **Account › Company:** colleagues and their roles, for a customer with a company name.
- **Orders:** more pages, a progress timeline, invoices, cancel or ask to cancel, buy again; returns with a step-by-step
  form and **Account › Returns**.
- **Checkout:** pay on invoice (a method with `code: "invoice"`), newsletter consent; **Request a quote** from the bag
  (`features.quotes`).
- **Product pages:** write a review (`features.reviewPolicy`, `?review=1` opens the form), questions and answers
  (`features.questions`), **Email me when it is back** on a sold-out option (`features.stockAlerts`).
- **Newsletter:** double opt-in with `/newsletter/confirm` and `/newsletter/unsubscribe`; alert emails stop at
  `/alerts/unsubscribe`.
- **Live chat:** Odoo's own chat when `features.liveChat` is set; the Content-Security-Policy allows the API's origin
  for its script, styles, fonts and websocket.
- Account, after-purchase and community calls load with their first use, so the first download stays within budget.

## What's new — Phase 8: monitoring and large catalogues

- **Error reports to Sentry** without its SDK (`VITE_SENTRY_DSN`; `SENTRY_DSN` for the render handler): render errors,
  uncaught errors, failed API answers with the backend's reference, which error screens now show.
  [CONFIGURATION.md](CONFIGURATION.md#environment-variables)
- **Web vitals** (LCP, CLS, INP, FCP, TTFB) to analytics as `web_vitals` events. [PERFORMANCE.md](PERFORMANCE.md#measuring-real-visitors)
- **Health check** at `/__loom/health`. [DEPLOY.md](DEPLOY.md#health-and-errors)
- **Offline shell** for a build with `VITE_PWA=on`.
- The Odoo backend now pages, sorts and filters very large catalogues in the database and caps `per_page` at 100.

## What's new — Phase 7: found on Google, and marketing that works

- **Pages rendered on request** (`server/handler.mjs`): a product added in the backend after the build is a real page
  for crawlers and link previews, with its own head and data; `404` for an address that is nothing, `301` for a changed
  slug, `503` in maintenance; the browser adopts the server's markup (hydration). Adapters for Vercel, Netlify,
  Cloudflare Pages, Node and Docker. [DEPLOY.md](DEPLOY.md)
- **robots.txt and sitemaps from the backend** on a live store, through the render handler.
- **Heads from the backend:** every page's `seo` block (title through the store's template, description, preview image,
  noindex), canonical links with the language prefix, and `hreflang` alternates. [API.md](API.md#search-engines)
- **Structured data:** per-variant offers with GTIN, returns window and free delivery, breadcrumbs, product lists,
  blog posts, organization and site search; its code loads after the page in the browser.
- **Images in sizes** from the backend (`srcset`), optionally through an image CDN (`media.imageUrlTemplate`).
- **Analytics and ad tags** the merchant sets (GA4, Tag Manager, Meta, TikTok, Pinterest), loaded by consent category,
  and the full set of shop events. [CONFIGURATION.md](CONFIGURATION.md#analytics)
- **Campaigns on orders:** UTM tags and click IDs of the first and last visit go with the bag.
  [API.md](API.md#where-the-shopper-came-from)
- **Search:** suggestions under the header box, pages of results, similar names for a typo, popular searches, and a
  search log for the merchant. [API.md](API.md#search)
- Product pages start loading when a card is hovered.

## What's new — Phase 6: money, countries and languages

- **Every currency's decimals:** prices, the price filter and analytics use the decimals the backend reports, so a
  dinar store shows 24.560 KWD, not 245.60. No more assumed dollars in the price filter or product structured data.
  [API.md](API.md#money)
- **Addresses the way each country writes them:** checkout, billing and the address book follow the country's field
  order and words (State, Province, County; ZIP code, PIN code), and a country without postcodes does not require
  one. [API.md](API.md#orders-and-account)
- **Languages:** the storefront's text in English, French, Spanish, German, Italian, Portuguese, Dutch, Arabic and
  Hindi; `/fr/...` addresses, the store's default language otherwise, `X-Loom-Lang` on every API call, and `<html lang
  dir>`. [CONFIGURATION.md](CONFIGURATION.md#i18n)
- **Right to left:** Arabic lays the whole storefront out right to left (logical spacing, drawers, mirrored arrows).
- **Currency switcher** in the header when the Odoo website offers more than one currency: the choice is sent as
  `X-Loom-Pricelist` on every call and the bag is repriced in it. [CONFIGURATION.md](CONFIGURATION.md)

## What's new — 2026-09-14

### Bag and checkout

- **Bag notices:** when the backend reprices the bag or removes something no longer on sale, each `notices` message is
  shown once. [API.md](API.md#cart)
- **Phone** is required or optional as the backend says (`checkout.phoneRequired`).
- The order page shows the discount, and "sold out at checkout" names the item.
- **Delivery for the address:** checkout prices delivery methods as the address is typed; the product page has a
  postcode checker (`GET /serviceability`).
- **Billing:** a different billing address, and a company name and tax ID for businesses, at checkout and in the
  account; addresses are for deliveries or invoices.
- **Promotions:** several codes with remove buttons, **Choose your reward**, free-product lines, promotions by name,
  gift card balance check, **Account → Rewards**, and quantity prices on the product page.
- **Checkout extras:** delivery instructions, gift message and wrapping, a required terms checkbox, and a minimum order
  message that holds back checkout (`checkout.orderNote`, `giftMessage`, `giftWrap`, `termsRequired`, `minimumOrder`).
  [CONFIGURATION.md](CONFIGURATION.md)
- **Free delivery bar** follows the backend's `freeShippingProgress.percent`.
- **Accounts in checkout:** "Have an account? Sign in" returns to checkout, the header bag shows the merged bag right
  after signing in, and a guest's order page offers **Create an account**.
- **Saved items for guests** in API mode (kept in the browser, merged on sign-in) and **Save for later** in the bag.
  [API.md](API.md#wishlist)
- **Click & collect and delivery slots** at checkout, for methods the backend marks `pickup` or `slots`: a shop list
  nearest the postcode, and slot choices by day; the order page shows the shop or slot. [API.md](API.md#cart)
- **The build renders cart, checkout, sign-in, account, saved items and order pages** once on the server, writing
  nothing, so a page that throws on its first render fails `npm run build` (a checkout crash had slipped through: those
  pages are never prerendered). [PERFORMANCE.md](PERFORMANCE.md#prerendering)
- **Bundle budgets per build:** a live store's first download must stay under 115 KB of JavaScript (it was 125 KB for
  both); the demo, which also carries the demo backend, under 130 KB. [PERFORMANCE.md](PERFORMANCE.md)

### Payments made simple

- **Stripe on the checkout page:** Stripe's Payment Element appears when the method is picked, checks the card on
  **Pay**, and confirms with 3-D Secure in place; a bank that needs its own page comes back to `/checkout/return`.
  Drivers can now `mount` a gateway form before the payment exists. [CHECKOUT.md](CHECKOUT.md#drivers)
- **Apple Pay and Google Pay** buttons in the bag and at checkout (Stripe's Express Checkout Element), priced by the
  backend for the wallet's address (`POST /carts/:id/express-options`, `POST /carts/:id/shipping-options`).
- **Cash on delivery fee** shown on the method, in the total and on the order; the button says **Place order**
  for a method paid later. [API.md](API.md#on-site-payments)
- **Pay now** on an order that is placed but unpaid (`canPay`, `amountDue`), opened ready to pay by
  `/order/:id?pay=1`; a failed hosted payment of an order returns to it.
- **A bag with a payment page open** says so, with **Cancel payment** (`paymentInProgress`,
  `POST /carts/:id/cancel-payment`).
- **Save for next time** at checkout and **Account → Payment methods** to remove saved methods.
- **Refunds from the admin against Odoo** (`refund` action, `refundable`), with *Refunded* and *Partly refunded*
  payment statuses; orders list what was refunded and a refunded order says so.

### Your store's content, not the demo's

- **No demo on a live store.** Pages, footer copy, promises, logo mark, page title, icons and link card no longer come
  from the demo; a live build that still contains demo copy fails (`scripts/brand-leak.mjs`). The documentation
  pages, the "live api" tag and the source link are demo-only. [API.md](API.md#pages-contact-consent-access-and-blog)
- **Store unavailable, maintenance and password screens** instead of a silent fallback to the demo catalogue.
- **Pages from the backend** (`GET /pages/:slug`) with text, tables, images, FAQ accordions, contact details and a
  contact form; they are prerendered.
- **Theme from the backend:** colours, fonts and corner radius applied at runtime and in prerendered pages.
- **Cookie consent banner** with preferences, Consent Mode v2 and opt-in analytics; **Cookie settings** in the footer.
- **Blog** pages (`/blog`, `/blog/:slug`), **rotating announcements**, store contact details in the footer.
- **Accessibility:** dialogs and the bag and menu drawers keep keyboard focus inside while open and give it back
  when closed, and closed drawers are out of the Tab order; `e2e/tests/a11y.spec.js` runs axe on the main pages.

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
