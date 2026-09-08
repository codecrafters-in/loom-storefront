# Conversion and trust

Why the fields in this theme exist, and what the evidence says about each one.
Every element below is API-driven, so a merchant can turn it on with data rather
than a deploy.

## The number that decides apparel

Apparel returns run **20–40%**, the highest of any e-commerce category, against
an all-category average of about 19%. **Size and fit cause roughly two thirds of
fashion returns**, with "too small" the single most common complaint. Style and
colour account for around 23%, quality about 10%.
([NRF via Richpanel](https://www.richpanel.com/learn/ecommerce-return-rates),
[Rocket Returns](https://www.rocketreturns.io/blog/ecommerce-return-rates-2025-complete-industry-analysis-benchmarks-by-category))

That reframes the whole page. A conversion you win by hiding fit information is
a return plus a refund plus return shipping plus a customer who does not come
back. **The goal is not "add to cart"; it is "add to cart and keep it."**

Bracketing — ordering several sizes intending to return most — is now mainstream,
up from roughly 40% of shoppers in 2018. Every piece of fit certainty you give
someone is a size they do not order speculatively.

---

## What the theme ships, and why

### 1. Garment measurements per size — `product.sizeChart`

A letter size means nothing across brands. A chest measurement in centimetres is
checkable against a garment the shopper already owns, and it is the only sizing
signal that transfers between labels.

The size-chart dialog ends with the one instruction that actually works: *lay a
garment you already like flat, measure across the chest 2.5cm below the armhole,
double it, match the table.*

Interactive size guides reduce both pre-purchase hesitation and post-purchase
returns.
([ConvertCart](https://www.convertcart.com/blog/apparel-product-page-examples))

### 2. Aggregated fit feedback — `product.fit.feedback`

`{ small: 34, true: 61, large: 5 }`, rendered as one bar.

This is the brand's cut described by the people who bought it, not by the brand.
It outperforms any copy a merchant writes about their own fit, because the
shopper knows who wrote each.

**Do not fabricate it.** If you have no post-purchase survey, omit `feedback`.
A made-up distribution produces exactly the returns it was meant to prevent.

### 3. Model height and size worn — `product.fit.model`

The cheapest fit signal that exists: it turns a photograph into a scale
reference. "Model is 5'9" and wears a S" costs one line and answers the question
every shopper is silently asking.

### 4. Fabric, weight and origin — `product.fabric`

Drape, warmth and whether something is see-through are weight questions. 190gsm
linen and 110gsm linen are different products sold under the same word.
Composition, gsm, construction and mill are what a considered buyer is looking
for, and almost nobody publishes them.

### 5. Third-party certifications — `product.fabric.certifications`

OEKO-TEX Standard 100, GOTS, Responsible Wool Standard, Global Recycled
Standard, Leather Working Group. These are independently audited and checkable,
which is the entire difference between a certification and a claim — and the
reason they survive the greenwashing scepticism that kills self-declared
sustainability copy.
([Mughal Apparel](https://www.mughalapparel.com/blog/understanding-apparel-certifications/),
[Hemptique](https://hemptique.com/pages/oeko-tex-vs-gots-certification))

### 6. Returns and delivery beside the buy button — `TrustRow`

Placement beats presence. **Moving the return policy from the footer to next to
add-to-cart lifts add-to-cart rate by around 23%** — same words, different
position, because the doubt arrives at the moment of commitment.
([SplitBase](https://splitbase.com/blog/high-converting-product-page))

The theme also shows a **dated** delivery estimate rather than a range.
"Arrives Thursday 12 September" is a fact to plan around; "2–4 working days" is
arithmetic the shopper has to do, and doing it is a moment to leave.
`GET /delivery-estimate` supplies it.

### 7. Reviews with fit data — `review.size` `review.height` `review.fit` `review.photos`

A five-star review that says "lovely" is decoration. "Bought size M, 5'11", runs
small" is a fitting room.

Two findings worth designing around:

- **Real customer photos in the gallery lift product-page conversion by ~35%**
  versus stock imagery alone.
- **The conversion sweet spot for a rating is 4.75–4.99, not 5.0.** A perfect
  score reads as filtered. The demo catalogue is rated 4.3–4.9 on purpose.
- Specific counts ("302 reviews") convert better than stars alone, so the theme
  always renders the number.
([ConvertCart](https://www.convertcart.com/blog/apparel-product-page-examples))

### 8. Honest scarcity — `product.social`

Real counts only: units in stock, bought in the last 30 days, saved. Below a
configurable threshold the block renders **nothing** rather than advertising that
a product is unpopular.

There is no "17 people are viewing this right now" in this theme and there will
not be. Shoppers recognise the pattern, and the moment they do, every other
number on the page — including the honest ones — becomes suspect.

### 9. Trust signals at the decision point — `storefront.trust`

Around 70% of online shoppers look for trust signals before completing a
purchase, and well-placed ones can lift conversion meaningfully. The theme
renders payment marks and a secure-checkout line inside the buy box, not in the
footer.
([CrazyEgg](https://www.crazyegg.com/blog/trust-signals/),
[Metricuno](https://www.metricuno.com/ecommerce-trust-signals))

### 10. Fit warnings in the grid — `ProductCard`

"Runs small" appears on the card, not just the product page. Someone comparing
eight products decides which two to open from the grid, and that is the fact
that decides it.

---

## Turning it on

Everything above is data. Nothing needs a code change.

| Element | Field | Fallback if absent |
| --- | --- | --- |
| Size chart | `product.sizeChart` | Link to the generic size guide page |
| Fit verdict and bar | `product.fit` | Block hidden |
| Model reference | `product.fit.model` | Line hidden |
| Fabric panel | `product.fabric` | Block hidden |
| Certifications | `product.fabric.certifications` | Row hidden |
| Delivery date | `GET /delivery-estimate` | Falls back to shipping copy |
| Review fit data | `review.size` `height` `fit` | Review renders without it |
| Customer photos | `review.photos` | Row hidden |
| Demand counts | `product.social` | Hidden below threshold |
| Payment marks | `storefront.trust.payments` | Row hidden |

Feature switches live in `storefront.trust`:

```json
{
  "trust": {
    "payments": ["Visa", "Mastercard", "Amex", "PayPal", "Apple Pay", "UPI"],
    "repairs": true,
    "showCertifications": true,
    "showFitFeedback": true,
    "showSocialProof": true,
    "socialProofThresholds": { "bought": 25, "saved": 20 }
  }
}
```

---

## If you only do three things

1. **Publish garment measurements per size.** It is the single highest-leverage
   field in an apparel catalogue and most stores do not have it.
2. **Put returns and a dated delivery estimate next to the buy button.** Same
   copy you already have, moved.
3. **Collect fit feedback after delivery** — one question, three options — and
   publish the distribution. It compounds: every order improves the next
   shopper's decision.

---

## What this theme deliberately does not do

- No countdown timers on evergreen products.
- No fake viewer counts or invented "only 2 left" when there are forty.
- No pre-checked marketing opt-ins.
- No card fields. Payment is handed to a provider — see [CHECKOUT.md](CHECKOUT.md).

These lift a single session's numbers and cost the second purchase. For a store
selling £200 coats that people are meant to keep for a decade, that is a bad
trade.

---

## Sources

- [Ecommerce Return Rates in 2026 — Richpanel](https://www.richpanel.com/learn/ecommerce-return-rates)
- [Ecommerce Return Rates 2025 — Rocket Returns](https://www.rocketreturns.io/blog/ecommerce-return-rates-2025-complete-industry-analysis-benchmarks-by-category)
- [Why Is Fashion E-Commerce Return Rate So High — Koozee](https://koozee.ai/blog/fashion-ecommerce-return-rate)
- [Apparel Product Page Examples — ConvertCart](https://www.convertcart.com/blog/apparel-product-page-examples)
- [Product Page Highlights — SplitBase](https://splitbase.com/blog/high-converting-product-page)
- [Trust Signals That Boost Conversion — CrazyEgg](https://www.crazyegg.com/blog/trust-signals/)
- [Ecommerce Trust Signals — Metricuno](https://www.metricuno.com/ecommerce-trust-signals)
- [Understanding Apparel Certifications — Mughal Apparel](https://www.mughalapparel.com/blog/understanding-apparel-certifications/)
- [OEKO-TEX vs GOTS — Hemptique](https://hemptique.com/pages/oeko-tex-vs-gots-certification)
