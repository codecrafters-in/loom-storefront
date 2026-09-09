# Reference payments and email server

The part of a storefront that cannot run in a browser.

Two things belong on a server and nothing else does: **the payment secret and
the mail password**. Everything else in this project runs happily in the page.

```bash
cd examples/server
cp .env.example .env      # fill in your keys
npm start                 # payments work with no install at all
npm install               # only needed for email
```

Nodemailer is loaded on demand rather than imported, so the payment half boots
with zero dependencies — HMAC is in `node:crypto` and Razorpay is an HTTP API.
Refusing to take money because the mail library is missing would be absurd.

## Routes

| | |
| --- | --- |
| `POST /carts/:cartId/checkout` | Create a Razorpay order for a cart **it prices itself** |
| `POST /payments/verify` | Check the signature, then place the order |
| `POST /webhooks/razorpay` | The truth, for when the browser closed early |
| `POST /admin/orders/:id/refunds` | Refund in full or in part |
| `POST /admin/notifications/test` | Send one email to prove the wiring |

## The three things this gets right

**It will not charge an amount the browser sent it.** This is the vulnerability
in almost every hand-rolled checkout: the page posts `{ amount: 24900 }`, the
server bills it, and anyone with a console open buys a coat for a penny. The
cart is re-priced by asking `STORE_API` for it. With `STORE_API` unset the
route refuses rather than guessing — a checkout that quietly trusts the client
is worse than one that does not start.

**It verifies signatures in constant time.** Razorpay's handler runs in the
page, so anything it reports can be forged; the HMAC check is the only thing
that makes a payment real. Comparing hashes with `===` leaks their contents one
character at a time, so `crypto.timingSafeEqual` is used instead. The webhook
signature is computed over the **raw request bytes** — signing a re-stringified
body is a well-known way to make verification pass for a payload that was
tampered with.

**It treats the webhook as the truth.** A shopper who pays and closes the tab
before the redirect has still paid. Without a webhook the money is taken and no
order exists, which is the most common way a hand-rolled checkout loses a
customer permanently. Order creation is keyed on the payment id, because
Razorpay retries and a retry must not place a second order for the same money.

Email is sent but never awaited by the payment path. A failing mail server must
not fail a payment that already succeeded — the customer has been charged, and
telling them the checkout broke because Gmail was slow is the worst outcome
available.

## Gmail

Use an **App Password**, not your account password — Google refuses the latter,
and an App Password can be revoked on its own without changing your login.

1. `myaccount.google.com` → Security → turn on 2-Step Verification
2. Security → App passwords → generate one for "Mail"
3. Put the 16 characters in `SMTP_PASSWORD`, with no spaces

`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER` your full address.

Gmail will send a few hundred messages a day and then stop. That is fine for a
new shop and not fine for an established one — move to a transactional provider
when order confirmations start bouncing, not before.

## Deploying

It is one file and the standard library. Anything that runs Node will host it:
a small VPS, Railway, Render, Fly. Set the environment variables in your host's
dashboard rather than shipping `.env`, and point the storefront's **Settings →
Payments → Create-order endpoint** at it.

Then set the webhook URL in the Razorpay dashboard to
`https://your-server/webhooks/razorpay` and paste the signing secret into
`RAZORPAY_WEBHOOK_SECRET`. Without it the route refuses every call, which is
the correct behaviour for an endpoint that places orders.
