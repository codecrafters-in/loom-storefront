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

### 10. Structured enrichment — `product.enrichment`

Highlights, features and a specification table, in three places rather than one.

The split is the point. A single long table gets read by almost nobody, and the
shopper who does want one fact has to hunt for it. Six key/value pairs beside
the buy button is a two-second scan that answers "is this the kind of thing I am
looking for" before anyone commits to reading a paragraph — and the full table,
one group at a time in the detail stack, still catches the person who wants to
check the leg opening.

**It sits between the highlights and the picker, and none of it is closed.**
Three placements were tried and two were wrong in the same way:

- A *full-width section below the fold* asks a shopper to scroll the buy button
  off the screen to find the fabric weight. Most do not go looking, and the ones
  who would have were not the ones you were losing.
- A *stack of accordions* asks for a click per section. Same failure, smaller
  scale: the shopper willing to open four panels was already going to buy.
- *Under the buy button* still put the reason a shopper trusts the piece a
  screen and a half below where they start reading. Detail that arrives after
  the decision is detail that did not help make it.

So it is one open block with tabs, directly under the highlights and above the
colour picker. The first tab renders on arrival; the others cost one click each
rather than one click per section.

**Yes, this moves "Add to bag" down, and that is the right trade.** The sticky
buy bar covers it, and the observer driving that bar fires on *not visible*
rather than *was visible and left* — so a button below the fold on arrival means
the bar is present from the first paint. There is never a moment with no way to
buy. Trading button position for detail position is only safe *because* that bar
exists; on a page without one, do not make this move.

Tab order follows the order the questions arrive: what is it made of → what are
the numbers → what is different about it → how is it built → who made it. The cost of moving into
the column is width, which is why the specification table pages by group instead
of laying out two columns — the groups are the units a shopper thinks in, so a
slide is a complete answer rather than an arbitrary slice.

Feature cards sit side by side with the next one deliberately cut off at the
edge. A half-visible card is the only reliable way to say "there are more of
these" without a caption saying so, and it is why the row is 86% wide rather
than a tidy 100%.

Two rules that keep it useful rather than decorative:

- **Highlights are capped at six.** More and it stops being a scan and becomes
  the specifications table with delusions, which is worse than either.
- **Attributes come from a shared vocabulary.** Free text everywhere produces
  `Fabric`, `fabric`, `Material` and `Composition` as four attributes across four
  products, and nothing can ever be filtered or compared. The vocabulary is
  suggested rather than enforced, so nobody is stopped from describing what they
  actually sell.

`manufacturer` is a separate matter: the manufacturer and packer address, the
country of origin and the net quantity are **legally required** on an e-commerce
listing in several markets, India included under the Legal Metrology rules. It
is compliance, not conversion, and it belongs in a labelled block rather than
buried in a description.

### 11. Key facts over the first photograph — `ImageKeyFacts`

Two or three chips in the corner of the main image: `Pure cotton · 140 gsm ·
Relaxed`.

The cheapest trust signal on the page. A visitor who has looked at nothing but
the picture has still read the three facts that decide whether this is the right
kind of garment — no scroll, no tab, no click. On a product page that is a large
share of the traffic, and it is the share least likely to be reached by anything
below the fold.

Three constraints stop it becoming a sticker on the product:

- **First image only.** Shots two onward are the detail crops — collar, weave,
  hem — and covering those covers the answer somebody opened them for.
- **Opaque chips, not text on the photo.** White text needs a scrim, a scrim
  darkens the garment, and the garment is what is being sold.
- **Values longer than 24 characters are skipped, not truncated.** A composition
  like "Recycled polyester shell, Recycled polyester fill" wraps the strip onto
  a second row and turns a glance into a caption block. The next fact takes its
  place instead.

It is `aria-hidden` and `pointer-events-none`: every fact is also in the
highlights list, so a screen reader hears it once, and nothing decorative
intercepts a click meant for the image.

### 12. The services block — `product.enrichment.assurances`

Returns, exchange, repair and payment, in a short list under the buy button.

This is the block a marketplace listing puts directly under the price, and it is
doing different work from everything above it. The specification table answers
*is this the right thing*. This answers *what happens if it is not* — and in
apparel, where the shopper cannot try it on and knows it, that is usually the
last question standing between a considered buyer and the button.

Two details that matter more than the copy:

- **The explanation is behind a disclosure, not printed.** A returns policy set
  out in full is four lines of legal prose beside a call to action. The label is
  the reassurance; the wording is there for the one shopper in twenty who checks
  it before committing.
- **Product rows replace the store's, they do not merge.** A coat with a
  ten-year structural guarantee must not also advertise the store's two-year
  one. Omitting the field inherits; an empty array means *this product has none*.

### 13. Who made it — `product.enrichment.maker`

This started as a marketplace seller card — name, rating, years with us — and it
was the wrong shape twice over. On a marketplace the seller is the variable and
the rating is the reassurance; on an own-brand store the seller is never in doubt
and the card has nothing to reassure anyone about. Worse, a rating for a supplier
nobody can review is a number somebody typed, which is the fastest way to make
the review count and the stock level look typed too.

What survived is the part that was information rather than decoration: **who wove
the cloth and where**, as two rows at the top of the compliance block. That is
where a shopper already looks for manufacturing facts, and the address on those
rows is the brand's — so the mill is new information rather than a second copy.

The same instinct applies to `countryOfOrigin`. It is legally mandated in several
markets, and answering it with "see product specifications" is a shrug on a
required field when the answer is one field away in the fabric data.

### 14. The variant sheet — mobile

On a phone the buy box is one column, so by the time a shopper has read the
detail the colour swatches are most of a screen above them. Comparing two
colourways means scrolling up, tapping, scrolling back down — twice — and the
second comparison is the one nobody makes.

The sticky bar's selection line is therefore a button, not a caption. Tapping it
opens the same pickers in a sheet over the page, and "Add to bag" with no size
chosen opens the same sheet rather than scrolling somewhere. The sheet stops
short of full height so the photograph stays visible behind it, which matters
most when the thing being changed is the colour.

Both pickers are the same components the buy box uses. A second copy of a
variant picker is how "sold out" ends up struck through in one place and greyed
in the other, and how one of them quietly stops handling a sparse matrix.

### 15. Fit warnings in the grid — `ProductCard`

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
| Highlights grid | `product.enrichment.highlights` | Block hidden |
| Key facts over the image | first 3 of `enrichment.highlights` | Overlay hidden |
| Services block | `product.enrichment.assurances` | Falls back to `storefront.trust.assurances` |
| Mill name and location | `product.enrichment.maker` | Rows hidden |
| Feature cards | `product.enrichment.features` | Tab hidden |
| Specifications | `product.enrichment.specs` | Tab hidden |
| Manufacturer info | `product.enrichment.manufacturer` | Tab hidden |

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
