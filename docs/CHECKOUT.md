# Checkout and payments

## The rule

**This theme never collects a card number, and neither should yours.**

The moment a card number, CVV or expiry date is entered into a field your
JavaScript controls, your entire frontend enters PCI DSS scope — every build
step, every dependency, every CDN. Compliance goes from a short self-assessment
questionnaire (SAQ A) to a long one with quarterly scans (SAQ A-EP), and one
compromised npm package becomes a card-skimming incident.

Every payment provider gives you a way to avoid this. Use it.

| Provider | Use | Not this |
| --- | --- | --- |
| Stripe | Checkout Session, or Elements in an iframe | Raw card fields |
| Razorpay | Payment Links, or the hosted Checkout modal | Custom card form |
| Adyen | Hosted Payment Page, or Drop-in | Raw card API |
| PayPal | Smart Buttons | — |
| Cashfree / PayU | Hosted checkout | — |

The address form in this theme is exactly the part that is safe to own.

---

## The five modes

Set `checkout.mode` in your storefront config.

### `demo` — the default

```json
{ "checkout": { "mode": "demo" } }
```

Places a fake order through the bundled adapter and navigates to the
confirmation. No money moves. The checkout page shows a visible notice so a
client reviewing a preview is never confused about whether it is live.

Use for: previews, design review, the public demo.

## Where secrets live

**A `key_secret`, a webhook secret or a Gmail app password cannot go in
storefront settings.** Not "should not" — cannot. The admin panel is a browser
app and `GET /storefront` is served to every visitor, so a secret there is not a
weak setting, it is the whole secret published.

| Settings, and served to everyone | Your server only |
| --- | --- |
| Razorpay `key_id` | `key_secret` |
| Stripe publishable key | Stripe secret key |
| Checkout mode, endpoint URLs | webhook signing secret |
| SMTP host, port, username, from-address | SMTP / Gmail app password |

The admin panel still collects the right-hand column — it posts to
`POST /admin/credentials`, which is write-only. The read returns whether each
one is set and when, never the value, so the field shows `Set · replace`.

In mock mode nothing is stored at all: the marker is written and the value is
dropped. A demo that accepts a live key is a demo that will eventually be handed
one.

### `razorpay` — their modal, over your page

```json
{ "checkout": { "mode": "razorpay", "publicKey": "rzp_live_…",
  "createUrl": "/carts/:cartId/checkout", "verifyUrl": "/payments/verify" } }
```

Three steps, and the middle one is the point:

1. Your server creates the Razorpay order **with its secret** and returns
   `{ "razorpay_order_id": "order_…", "amount": 24900, "currency": "INR" }`.
2. The browser opens Razorpay's modal with only `publicKey`. Card fields belong
   to their iframe, never to this app.
3. Your server verifies the signature and returns the Order.

A browser that could create the order could create one for a penny, which is
why step 1 is not optional. And Razorpay's success handler runs *in the page*,
so anything it reports can be forged — step 3 is the only thing that makes a
payment real, which is why the storefront returns the server's order and never
the handler's payload.

`examples/server` implements all three in about 450 lines.

### `redirect` — recommended for real stores

```json
{
  "checkout": {
    "mode": "redirect",
    "createUrl": "https://api.yourstore.com/checkout/sessions",
    "successUrl": "/order/:orderId",
    "cancelUrl": "/cart"
  }
}
```

The theme POSTs:

```json
{
  "cart_id": "cart_a1b2",
  "email": "sam@example.com",
  "shipping_address": {
    "name": "Sam Rivera", "line1": "117 Mercer Street", "line2": "Apt 4B",
    "city": "New York", "region": "NY", "postalCode": "10012",
    "country": "US", "phone": "+1 555 0134"
  },
  "shipping_method": "standard",
  "currency": "USD",
  "success_url": "https://shop.example/order/{ORDER_ID}",
  "cancel_url": "https://shop.example/cart"
}
```

Your endpoint responds:

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3" }
```

and the browser is sent there. Nothing after that runs in this app.

`success_url` and `cancel_url` are sent **absolute**, because the provider
redirects from its own domain and a relative path would resolve against theirs.
`{ORDER_ID}` is a literal placeholder — substitute your real order id when you
build the session.

#### Stripe

```js
// POST /checkout/sessions
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function createSession(req, res) {
  const cart = await loadCart(req.body.cart_id)          // your own lookup
  const order = await createPendingOrder(cart, req.body)  // status: 'pending'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: req.body.email,
    line_items: cart.lines.map((l) => ({
      quantity: l.quantity,
      price_data: {
        currency: cart.currency.toLowerCase(),
        unit_amount: l.unitPrice.amount,       // already minor units — no conversion
        product_data: { name: l.title, images: [l.image.url] },
      },
    })),
    shipping_address_collection: { allowed_countries: ['US', 'GB', 'IN'] },
    success_url: req.body.success_url.replace('{ORDER_ID}', order.id),
    cancel_url: req.body.cancel_url,
    metadata: { order_id: order.id, cart_id: cart.id },
  })

  res.json({ url: session.url })
}
```

> The theme's `Money.amount` is already in the smallest currency unit, which is
> exactly what Stripe's `unit_amount` wants. No multiplication, no rounding, no
> float. This is the main reason the contract uses integers.

**Mark the order paid from the webhook, never from the success redirect.** A
shopper can close the tab before the redirect fires, and anyone can visit a
success URL by hand. `checkout.session.completed` is the only trustworthy
signal.

```js
// POST /webhooks/stripe
const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
if (event.type === 'checkout.session.completed') {
  await markPaid(event.data.object.metadata.order_id)
  await decrementInventory(event.data.object.metadata.cart_id)
}
```

#### Razorpay

```js
const order = await razorpay.orders.create({
  amount: cart.total.amount,          // minor units again
  currency: cart.currency,
  receipt: internalOrder.id,
  notes: { cart_id: cart.id },
})
const link = await razorpay.paymentLink.create({
  amount: cart.total.amount,
  currency: cart.currency,
  customer: { email: req.body.email, contact: req.body.shipping_address.phone },
  callback_url: req.body.success_url.replace('{ORDER_ID}', internalOrder.id),
  callback_method: 'get',
})
res.json({ url: link.short_url })
```

Confirm on the `payment.captured` webhook, verifying the signature.

### `api` — payment settled elsewhere

```json
{ "checkout": { "mode": "api", "createUrl": "/carts/:cartId/checkout" } }
```

POSTs the same body and expects an `Order` back, which the theme renders on the
confirmation page. For invoicing, cash on delivery, wholesale terms, or a
provider you integrate entirely server-side.

`:cartId` in `createUrl` is substituted. A relative path is resolved against
`VITE_API_BASE_URL`; a full URL is used as-is.

---

### `payments` — the backend's gateways, on this page

```json
{ "checkout": { "mode": "payments", "successUrl": "/order/:orderId", "cancelUrl": "/cart" } }
```

For a backend that already integrates payment gateways — Odoo with the LOOM
module is one. The backend lists what can pay for this cart; the shopper picks
one on the checkout page; the backend creates the payment and is the only party
that can say it was paid. The storefront stores nothing about the payment.

The page runs in two steps. **Continue to payment** posts the address and
delivery to `POST /carts/:id/payment-options` and lists the methods (re-fetched
when the country or delivery method changes). **Pay** posts to
`POST /carts/:id/payments`, then follows the method's `flow`:

| `flow` | What happens | Examples |
| --- | --- | --- |
| `offline` | Nothing to do in the browser; the order is placed as pending | Cash on delivery, bank transfer |
| `token` | The backend charges the saved method | Saved cards |
| `direct` | A driver runs the gateway's own form or modal on this page | Razorpay, the demo card |
| `redirect` | The browser goes to the gateway's hosted page, then back to `/checkout/return` | PayPal, Mollie, PayU |

After that the page polls `GET /payments/:id` (1s, backing off to 5s) until the
payment is final, then opens the order. After two minutes it stops and tells the
shopper they will get an email, rather than spin. `/checkout/return?payment=…`
does the same for a shopper coming back from a hosted page.

A payment can be `paid` while `order` is still `null`: the money arrived and the
backend is still confirming the order (it retries if that step failed). The page
keeps polling and shows the backend's `message` — it is not a failure, and the
shopper is never asked to pay again.

`GET /payments/:id` reports a completed payment as `paid`; the order it created
reports the same payment as `payment.status: "captured"`. Both mean the money
moved.

The address step's **State / region** is a dropdown when `GET /countries/:code`
lists states for the chosen country and a text box otherwise, so the address the
payment step posts is one the backend accepts — see [API.md](API.md).

Card numbers still never touch this app: a `direct` driver hands the card to the
gateway's own iframe or modal, and a `redirect` gateway takes it on its own site.

#### Drivers

A `direct` method is only offered if the storefront has a driver for its
`provider`; a method without one is left out rather than failing at the pay
button. Two ship: `demo` (a test card form and an outcome select) and `razorpay`
(Razorpay Checkout's modal). Closing the modal is a cancel, not an error — the
bag is untouched and the shopper can pick again.

To add one, create `src/lib/payments/drivers/<provider>.js` and register it in
`drivers/index.js`:

```js
export default {
  provider: 'stripe',          // the backend's provider code
  needsInput: false,           // true if the page collects something first
  validate: (input) => null,   // optional: a message, or null when input is fine
  async run({ payment, api, input }) {
    // Mount or open the gateway's own form with payment.client (public values
    // only). If the backend needs the gateway's result, send it with
    // api.paymentAction(payment.id, '<action>', result) and return the answer.
    return payment
  },
}
```

Return the backend's answer. Polling takes over from there, so a driver never
decides that a payment succeeded. Its script loads through
`lib/payments/load-script.js`, once.

---

## What your server must do

Regardless of mode, the checkout endpoint is responsible for the things a
browser cannot be trusted with:

1. **Reprice the cart from your own data.** Never trust a total that arrived
   from a client. Look up each `variant_id`, take the current price, and
   recompute.
2. **Re-check inventory.** Between "add to bag" and "pay" someone else may have
   bought the last one. Return `409 insufficient_inventory` and the theme shows
   the message on the checkout page.
3. **Re-validate the discount code.** Expiry, usage limits, minimum spend.
4. **Calculate tax.** The mock applies a flat 8% as a placeholder. Real tax
   depends on the shipping destination, the product category and often the
   customer's status — it belongs in a tax engine, not in a theme.
5. **Reserve stock, or handle the race.** Decrementing on webhook confirmation
   is simplest; reserving at session creation with a timeout is better for
   low-stock items.
6. **Be idempotent.** Webhooks are delivered more than once. Key on the
   provider's event id.

---

## Failure handling

Errors are shown inline on the checkout page using the `message` from your
response, so write it for the shopper:

```json
{ "message": "Only 2 of the Merino Crew in Oat / M are left.", "code": "insufficient_inventory" }
```

| Code | Theme behaviour |
| --- | --- |
| `insufficient_inventory` | Message shown, button re-enabled |
| `out_of_stock` | Same |
| `invalid_discount` | Same |
| `checkout_misconfigured` | `mode` is not `demo` but `createUrl` is empty |
| `checkout_no_redirect` | `redirect` mode, response had no `url` |
| `checkout_no_order` | `api` mode, response had no `id` |
| `payment_cancelled` | `payments` mode, the shopper closed the gateway's window. Shown as a notice, not an error |
| `payment_failed` | The gateway refused the payment. Message shown, shopper can pick again |
| `cart_changed` | The total moved since the methods were listed. Options re-fetched |
| `no_payment_methods` | Nothing the backend offers can take this cart to this address |
| `payment_unsupported` | A `direct` method with no storefront driver was forced through |

The last three are configuration mistakes and say so explicitly. See
[ERRORS.md](ERRORS.md).

---

## Testing the flow

1. Set `mode: "redirect"` and point `createUrl` at a local endpoint that returns
   `{ "url": "http://localhost:5173/order/test_123" }`.
2. Confirm the browser leaves the app.
3. Confirm `/order/test_123` renders from `GET /orders/test_123`.
4. Then swap in the real provider in test mode.

Do this before wiring the provider. It separates "my redirect contract works"
from "my Stripe keys work", and those fail differently.


## Refunds

```
POST /admin/orders/:id/refunds  { amount?, reason?, restock? }  → the Order
```

Omit `amount` to refund whatever is outstanding, which is what "Refund" means
when nobody has typed a number.

Refunds are **a list on the order**, not a flag:

```json
{
  "status": "refunded",
  "refundedTotal": { "amount": 24900, "currency": "INR" },
  "refunds": [
    { "id": "refund_1", "amount": { "amount": 4900, "currency": "INR" },
      "reason": "Returned one item", "createdAt": "…", "reference": "rfnd_…",
      "restocked": false }
  ]
}
```

A partial refund is the common case — one item back from a three-item order —
and a boolean cannot express "refunded ₹400 of ₹1,200, twice, for two different
reasons". The list is also the only shape that reconciles against the payment
provider's own records, which is what anyone doing the books actually needs.

**Only a full refund restocks.** Guessing which line a partial refund refers to
would put the wrong variant back, and a phantom unit in stock is worse than a
missing one — it sells. `checkout.restockOnRefund` turns even that off.

`payment.status` and `status` are deliberately separate. An order can be paid
and unshipped, shipped and refunded, or placed and never captured; collapsing
the two is how a refund ends up looking like a delivery.

## Overselling

`POST /checkout` **must re-check stock against the catalogue**, not against the
cart. Availability was last checked when the line was added, which may have been
yesterday. Without it, two shoppers who both add the last unit both get a
confirmed order and one of them gets an email nobody can fulfil.

```json
{ "code": "out_of_stock", "status": 409,
  "detail": { "lines": [{ "variantId": "…", "title": "…", "wanted": 3, "available": 1 }] } }
```

Name the shortfall. "Something in your bag is unavailable" sends a shopper
through five lines looking for it; `wanted` and `available` let the page fix the
quantity in place. And do not empty the bag — that loses them the thing they
were trying to buy.
