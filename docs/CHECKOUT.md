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

## The three modes

Set `checkout.mode` in your storefront config.

### `demo` — the default

```json
{ "checkout": { "mode": "demo" } }
```

Places a fake order through the bundled adapter and navigates to the
confirmation. No money moves. The checkout page shows a visible notice so a
client reviewing a preview is never confused about whether it is live.

Use for: previews, design review, the public demo.

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
