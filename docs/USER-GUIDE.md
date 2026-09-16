# User guide

For whoever runs the shop. Ten tasks, one screen each.

> Everything here is at **`/admin`**. Sign in with `admin` / `admin` on the demo;
> on a live store, **Sign in with Odoo** takes you to your Odoo login and back.
> Changes are live immediately — there is no publish button.

Once you are signed in, an **Admin** link appears in the shop's footer so you can
move between the two. Shoppers never see it.

---

## Add a product

**Products → New**

**Choose the product type first**, at the top of **Details**. On Odoo the type is
the product's category, and it decides what the editor asks for: a shirt has fit,
a size chart and fabric; a table has materials in kg and no size chart; coffee has
ingredients in grams. The tabs follow it, filled in the order you would think
about them:

| Tab | What goes in it |
| --- | --- |
| **Details** | Product type, title, slug, description, price, the details and care lists (named by the type) |
| **Media** | Images, their alt text, and which colour each one belongs to |
| **Variants** | The options it is sold in (Colour, Size, Weight, Grind, Finish…), then the combinations you sell |
| **Fit, size & fabric** | Only for a type that has them, and named after what it holds (*Materials*, *Ingredients*): fit verdict and model, size chart, composition, weight, certifications |
| **Highlights & specs** | Highlights, features, what it comes with, who made it (where the type asks for it), the spec table |
| **Organise** | Categories, tags, rating, demand counts, the related rail |

On **Variants**, add each option by name (the ones your other products use are
suggested), then its values. A colour option gets a swatch per value; any other
option takes words. The editor lists the combinations that have no row yet: add
them one by one or with **Add all**, then fill in stock per row. A product with no
options is sold as one variant.

> Adding values keeps everything you already typed. Adding a fourth colour does
> not wipe the stock counts on the first three.

> Changing the type of a product that is already saved asks first: specifications
> the new type does not define are removed when you save.

> **You will not lose what you type.** Unsaved changes stay in this browser, so a
> reload or a crashed tab reopens the product with *Unsaved changes … were
> restored*. **Save** keeps them; **Discard them** goes back to the saved version.

If a save is refused, the editor opens the tab with the problem and shows what to
fix. The usual ones on a live shop: a slug that ends in a number (write
`levis-501-jeans`, not `levis-jeans-501`), and words in a number field such as
**Recycled content**, which takes a percentage — the fabric itself goes under
**Fabric**.

---

## Change a price

**Products → click the row → Details → Price → Save**

Type it the way you say it: `168` for $168.00. It is stored as an integer so it
can never drift by a cent.

Fill **Compare at** to show a strikethrough and a "−12%" badge. Leave it empty
for no sale.

> Saving a price updates every size and colour of that product.

---

## Mark something out of stock

**Inventory → find the size → `−` until it reads 0**

(Or open the product, **Variants** tab, and set the number directly.)

That size greys out on the product page with a line through it. When every size
in a colour is gone, the colour swatch is struck through too. When everything is
gone, the product shows **Sold out**.

Use the **Low** and **Out of stock** filters to see what needs attention.

> Stock moves by `+` and `−`, never by typing a number. If two people adjust the
> same size at once, both adjustments land instead of one overwriting the other.

---

## Restock

**Inventory → `+10`**, or `+` one at a time.

---

## Add a sub-category

**Categories → New**

- **Slug** — the bit in the web address. Lowercase, hyphens: `shirts-linen`
- **Name** — what shoppers see: `Linen`
- **Parent** — pick `Shirts` to nest it, or leave blank for a top-level one

It appears in the menu under its parent straight away.

> A parent shows everything underneath it. `/shop/shirts` includes Oxford, Linen
> and Flannel without you filing anything twice.

---

## Rename the shop, change the logo

**Storefront → Company profile**

Store name changes the header, footer, browser tab and link previews. Leave
**Logo image URL** empty to use the built-in mark; paste a URL to use your own.

---

## Change currency

**Storefront → Pricing → Currency**

Also set **Locale** so numbers and dates format the way your customers read
them — `en-US`, `en-GB`, `en-IN`, `de-DE`.

> Currency changes how prices are *displayed and formatted*. It does not convert
> them. If you sell in more than one currency, your backend sends prices already
> converted — a browser doing exchange rates is wrong the day the rate moves.

---

## Set the free-shipping threshold

**Storefront → Pricing → Free shipping over**

In the smallest unit — `15000` is $150.00. The figure under the box confirms it.

This drives the "£28 away from free shipping" bar in the cart and the bag.

---

## Turn a feature off

**Storefront → Features**

Untick **Reviews** and every review disappears from the shop. Same for the
wishlist, search, accounts and the newsletter box.

> The pages stay reachable so old bookmarks and links do not break. Nothing on
> the site points to them any more.

---

## Change what "You might also like" shows

**Storefront → Recommendations → Strategy**

| Choose | You get |
| --- | --- |
| **automatic** | Similar category, fabric and price. Good with no effort |
| **same-category** | Anything from the same category |
| **best-sellers** | Your most-reviewed products |
| **manual** | Exactly what you pick per product |
| **off** | The section disappears |

---

## Decide what crawlers may do

**Admin → Storefront → Search engines.**

Set the **site URL** first — it is the one setting with no sensible default, and
a sitemap, a canonical tag and a link preview all need an absolute address.

**AI crawlers is your call, not the theme's.** Assistants increasingly answer
"where can I buy a linen shirt", and a shop they cannot read is not in the
answer. Against that, your photography and product copy end up in a training
set. Allow all, block all, or decide bot by bot.

> Switching **indexing** off removes the whole shop from search. That is right
> for a staging deployment — an indexed staging site competes with your real one
> for your own keywords — and wrong for anything you sell from.

---

## Take real payments

**Storefront → Checkout → Mode**

- **demo** — places a fake order. What you have now
- **redirect** — sends the customer to Stripe, Razorpay or whoever takes your
  money. **This is what a real shop uses**
- **api** — for invoicing, cash on delivery or wholesale terms
- **payments** — the backend's own payment methods, paid on the checkout page.
  **What an Odoo-backed shop uses**; the methods are switched on in Odoo, not here

For **redirect**, paste the address your developer gives you into **Create URL**.

> The shop never asks for a card number and never should. That is the payment
> provider's job, and keeping it that way keeps your site out of card-security
> compliance entirely. Your developer will want
> [CHECKOUT.md](CHECKOUT.md).

---

## See how it will look before you save

**Save & preview**, at the top of the product editor.

It saves first — a new product is created as a **draft**, so nothing reaches a
shopper before you mean it to — and then shows you the page. Previewing can
never lose what you have typed.

It renders the same components the shop does, so what you see is what a shopper
gets. You also get the listing card, because that is where
most people meet a product and a shot that works in the gallery can still be
wrong at thumbnail size.

A strip at the top flags anything that would look broken: no image, missing alt
text, no variants, everything out of stock, no category, still a draft.

> **Live page** beside it opens the published version in a new tab, for
> comparison. It only appears once the product is saved and published.

---

## Add photos and video

**Open the product → Media**

Drag files onto the panel, or **Choose files** — as many at once as you like.
Photos are resized automatically; video up to 25MB plays with controls on the
product page.

- **Drag a tile** to reorder. The first is the card image; the second is what
  the grid swaps to when someone hovers, so make it different — a fabric detail
  works well.
- **Alt text** goes under each tile. Describe the garment, not the photo.
- **Assign to a colour**: tick several tiles, choose the colour, **Assign**. The
  gallery then jumps to those shots when a shopper picks that colour.

**Reordering:** drag a tile onto another, or use the arrows on it. The order you
see is the order on the product page.

**Shoppers only see the shots for the colour they picked.** A photo tagged Pink
appears when Pink is selected; an untagged one — a fabric detail, a packshot —
appears for every colour. Tag nothing and everyone sees everything, as before.

> The tile shows each file's dimensions and warns if it is not 4:5, which is the
> shape the site is built around.

---

## Give a colour its own photo

Two ways, both fine:

- **Media tab** — tick the shots, choose the colour, **Assign**. That tags them
  and points every variant of that colour at the first one.
- **Variants tab** — click the little thumbnail on any row. Pick from the
  product's shots, or **Upload for this colour** to add one and attach it in the
  same action.

The gallery then jumps to that shot when a shopper picks the colour.

---

## Set stock or prices in bulk

**Open the product → Variants**

The bar above the table does one thing to many rows:

| Choose | Then |
| --- | --- |
| **Set stock to** / **Add to stock** | a number, and *every variant* or *all M* |
| **Set price to** / **Adjust price by** | `3.00` for *all XL* adds three pounds to every XL |
| **Use image** | a shot, for a colour or a hand-picked selection |

Tick individual rows first and the scope list gains **the N selected**.

> A price with an amber border differs from the product price. Changing the
> product price leaves it alone, so a size surcharge survives a repricing.

---

## Fill in highlights, features and specifications

**Open the product → Highlights & specs**

Five sections, and the storefront's own rendering sits beside them so you can
see what you are writing as you write it.

| Section | Where a shopper sees it | Keep it to |
| --- | --- | --- |
| **Highlights** | Under the price — **and the first three over the main photo** | Six pairs |
| **Comes with** | Under the buy button | Three or four rows |
| **Features** | "All details" → third tab, cards you swipe through | Two or three |
| **Specifications** | "All details" → second tab, one group at a time | As much as you like |
| **Manufacturer info** | "All details" → last tab | Whatever the law asks for, plus the mill |

> All of it sits in the column beside the buy button, and all of it previews at
> that width. Nothing lives in a full-width section below the fold, and nothing
> is hidden behind a closed panel: **"All details" sits directly under the
> highlights, above the colour picker, already open on Fabric & care.** Anything that costs a click before it can be read is
> enrichment that mostly does not get read — the shopper willing to open four
> panels was already going to buy.

> **Order the highlights carefully — the first three go over the photograph.**
> They appear as small chips in the corner of the main image, which is the only
> enrichment a visitor who never scrolls will ever read. Put the most decisive
> three first. A value longer than about 24 characters is skipped there (it
> would wrap the strip across the garment) and the next one takes its place; it
> still shows in full in the list below.

> Every section now puts its suggestions **above** the rows, grouped. A list
> found only after you have given up and typed something is a list for the
> merchant who least needed it.

**Highlights** are the two-second scan — fabric, fit, weight, the things
somebody checks before deciding to keep reading. Start typing in the key box and
it suggests `fabric`, `fit`, `sleeve` and the rest, with common values for
each. Type something else and it takes it. Only the first six show, and it tells
you if you have added more.

**Comes with** is what happens after the sale — returns, exchange, repair,
payment. It sits under the buy button because that is where the doubt arrives:
the specifications answer *is this the right thing*, and these answer *what
happens if it is not*.

Pick from the common apparel rows with one click, then edit the wording. The
**note** is the paragraph behind the small (i) — put the caveats there and keep
the label short enough to scan.

> Leave this section empty and the product uses the store-wide rows from
> **Settings → Trust**, which is usually what you want. Add rows here only where
> this piece genuinely differs — a coat with a ten-year guarantee, a raw denim
> with a stricter returns window. Product rows *replace* the store's rather than
> adding to them, so list everything the piece comes with, not just the extra.

**Features** are the two or three things a competitor could not copy-paste.
Choose an icon by looking at it — the grid shows every one there is, and
**Image URL** takes your own artwork. Write a title and a sentence; it counts
the characters and warns before the card clamps.

**Save for reuse** on any feature or service row puts it in your library, and it
appears as a one-click chip on every product after that. Worth doing for
anything you would otherwise retype — forty slightly different versions of
"Repairable for life" is forty chances to contradict yourself.

> Your attribute keys save themselves. Type `collar_type` on one product and it
> is suggested on the next, with every value you have used against it. You never
> have to remember whether you wrote "Collar type", "Collar" or "Neck" — which
> matters, because three spellings of one attribute is a filter that finds
> nothing.

> **A new product starts with its type's defaults.** If the category says Fabric is
> *Cotton* unless told otherwise, a new shirt opens with Fabric: Cotton already in
> its specifications. Change it, or remove the row, like any other.

> **Several values.** Some specifications take more than one value — *Linen, Hemp
> blend*. Type them separated by commas, or click the values under the box that
> other products already use. A value nobody has used yet is added for the next
> product.

> **Highlights and Specifications share their values.** Change *Fabric* in either
> and the other follows. A number attribute — Recycled content, Weight, Length —
> shows **Number in %** (or gsm, cm) in its box and warns if you type words.

**Manufacturer info** opens with **Woven by** and **Mill location** — the mill
that made the cloth, above the compliance rows, which carry your address rather
than theirs. Keep the mill location and the country of origin agreeing with each
other; they sit four rows apart and a shopper only has to spot that once.

**Specifications** is the full table. Rows sort themselves into General, Fabric
& care, Fit, Sustainability and Packaging by their key, so the order you type
them in does not matter — and on the product page it swipes one group at a time,
which is how the whole table fits in a column instead of a page.

> Feature cards sit side by side and swipe, with the next one deliberately cut
> off at the edge — a half-visible card is the only reliable way to say "there
> are more of these". Bodies longer than about 105 characters clamp to three
> lines with a **more** link, so the cards stay the same height. Write past that
> if the sentence needs it; nothing is lost.

> Every block disappears when it is empty. A product with nothing filled in is a
> shorter page, not a set of blank headings.

---

## Sign in as a shopper

**Any email and any password of six characters or more.** The demo backend has
no real authentication — it accepts what you type and signs you in as that
address, which is the point: an integrator swaps `mock.js` for `http.js` and
their own auth arrives with it.

Signing in for the first time seeds two orders on that address — one fulfilled
with tracking, one delivered — so **Account → Orders** shows something.

> Orders are scoped to the signed-in address. Sign out and the history is
> refused; sign in as somebody else and you see theirs, not the first person's.
> The order you placed as a guest still opens from its own confirmation link.

---

## What a customer sees in their account

**/account**, once signed in. It reads like a summary, not a form — a form opens
only for the one thing being changed, in place, with **Cancel** beside **Save**.

| Tab | What is on it |
| --- | --- |
| **Overview** | The latest order (number, date, status, total, thumbnails), personal details with **Edit**, the default address with **Manage**, and the number of saved items |
| **Orders** | Every order, newest first. Each card opens the order and its tracking |
| **Addresses** | One card per address with **Edit**, **Set as default** and **Remove** (which asks first), and an **Add a new address** tile |
| **Returns** | Live stores: every return, where it stands and what happens next — a refund on its way, or the amount refunded |

**An order's page** also shows, on a live store:

- **Cancel** or **Ask to cancel** while the store allows it. A request says it is waiting; if the store declines, its
  answer shows in its place.
- **Returns**: the order's returns with their status, and **Return items**. Items that cannot go back are listed
  greyed, with *Final sale* or the day their return window ended, and the form says before sending whether returns are
  approved straight away and when a refund starts.
- **Messages**: the conversation with the store about the order, and a box to write in when the store takes replies.
  It is left out when the store has order messages turned off.

**State / region follows the country.** For a country the backend has states for —
India, the United States, Canada, Australia and many more — it is a list; anywhere
else it is a text box. Checkout uses the same field, so a state picked from the
list is never refused. If something is missing, the field turns red and the
message names it: *Please add: State / region*.

---

## Show a different photograph for each colour

**Open the product → Media → the colour dropdown under each image.**

An image tagged with a colour appears only when that colour is selected. Leave
one on **All colours** — a fabric crop, a packshot, the size guide — and it stays
in the gallery whichever colour is chosen.

Then in **Variants**, each row's image picker points at the shot to jump to. Add
the combinations with **Add all** and it wires itself: a new row takes the image
tagged with its own colour if there is one.

> This is what makes the main photograph change when a shopper taps a swatch.
> Tag nothing and the gallery behaves exactly as it did before — one set of
> photographs shown for every colour.

---

## Decide what crawlers may do

**Admin → Storefront → Search engines.**

Set the **site URL** first — it is the one setting with no sensible default, and
a sitemap, a canonical tag and a link preview all need an absolute address.

**AI crawlers is your call, not the theme's.** Assistants increasingly answer
"where can I buy a linen shirt", and a shop they cannot read is not in the
answer. Against that, your photography and product copy end up in a training
set. Allow all, block all, or decide bot by bot.

> Switching **indexing** off removes the whole shop from search. That is right
> for a staging deployment — an indexed staging site competes with your real one
> for your own keywords — and wrong for anything you sell from.

---

## Take real payments

**Admin → Storefront → Payments.**

Pick a mode. `Demo` places fake orders and charges nothing — fine for a preview,
change it before anyone can reach the shop.

For Razorpay: put your **key_id** in Payments (it is public and ships in the
page, which is what it is for), and your **key_secret** in Secrets below. The
secret is written and never read back — the field shows `Set · replace`.

> **The demo has no server, so it stores nothing.** It records that you set
> something and discards the value. Do not paste a live key into a preview.
> `examples/server` in the repo is a deployable server that does hold them.

Point **Create-order endpoint** at that server. It prices the cart itself rather
than trusting the browser, which is what stops somebody buying a coat for a
penny.

---

## Send order emails

**Admin → Storefront → Email.**

For Gmail: `smtp.gmail.com`, port 465, your full address as the username, and a
**16-character App Password** in Secrets — not your account password, which
Google will refuse.

Get one at `myaccount.google.com` → Security → 2-Step Verification → App
passwords. It can be revoked on its own without changing your login.

Then **Send a test**. In the demo it tells you plainly that a browser cannot
open an SMTP connection and shows what it *would* have sent; against a real
server the same button sends.

> Gmail stops after a few hundred a day. Fine for a new shop, not for an
> established one — move to a transactional provider when confirmations start
> bouncing, not before.

---

## Refund an order

**Admin → Orders → open the order → Payment → Refund.** Against Odoo the money
goes back through the payment provider when it can refund, or with a credit note
for a full refund of an invoiced order; otherwise the dialog says to do it in
Odoo. Only staff with Invoicing rights see the button, and items coming back are
received as a return in Odoo.

It defaults to whatever is still outstanding. Enter less for a partial refund —
the order stays open and the amounts add up, so a second refund is not issued
from memory.

> **Only a full refund offers to put the stock back.** A partial refund does not
> say which item came back, and a phantom unit on the shelf is worse than a
> missing one — it sells.

---

## Change the delivery and returns wording

**Admin → Storefront → Delivery & returns.**

Each paragraph is editable, and the numbers fill themselves in: write
`{shipping}`, `{freeOver}` or `{returnsDays}` and they take their values from
the pricing settings above, so the prose cannot promise one returns window while
the cart honours another. An unrecognised token stays visible — a `{typo}` you
can see is a `{typo}` you can fix.

Remove every paragraph and the panel does not render.

---

## Choose what appears in "You might also like"

**Open the product → Organise → You might also like.**

Add products and order them with the arrows. Order is the whole point of doing
this by hand — if you did not have a specific first item in mind, one of the
automatic strategies is a better answer.

> This list is read **only** while **Storefront → Recommendations** is set to
> Manual. Every other strategy scores the rail itself and ignores what is here.
> With nothing chosen the rail falls back to best-sellers rather than rendering
> empty: an empty rail looks broken, a slightly-off one does not.

---

## Sell a colour in only some sizes

Ordinary — white might come in S and M only.

**Open the product → Variants → the bin icon on the row you do not sell.**

Tick several rows first and a **Remove** button appears next to the bulk bar.

Combinations you have removed are listed under **not created** with a plus, so
you can add them back later. Nothing is put back automatically.

> On the product page an unmade size is shown with a dashed outline and a
> tooltip; a sold-out one is struck through. Those are different answers — one
> is worth waiting for, the other is not.

---

## Stage a product before it goes live

**Open the product → click the green Published button at the top**

A draft is invisible: it does not appear in the shop, in search or in
recommendations, and its own web address returns "not found". You can still see
and edit it here, marked **Draft** in the list.

Tick it back on when the season opens.

---

## Fulfil an order

**Admin → Orders → To ship → open the order**

1. **Pack it.** The order page lists the items, the customer and the address to
   ship to.
2. **Mark as shipped.** Add the carrier, tracking number and tracking link if you
   have them — all optional, and you can add them later with **Add tracking**.
   The customer's order page changes to *On its way* with a **Track parcel**
   button. Against Odoo this completes the delivery order, so the stock leaves
   the warehouse.
3. **Mark as delivered** when it arrives. The customer's page says *Delivered*.

**Cash on delivery** works the same way, with one more step: ship it first
(this confirms the order), then press **Record cash received** under Payment
once the courier has collected the money. Until then it sits under **Awaiting
payment**, which lists every order whose money has not arrived yet: a payment
still pending, such as Cash on Delivery or a bank transfer, or an order with no
payment recorded at all (one created in the back office, for example). Cancelled
orders are never there.

The **To ship** and **Awaiting payment** numbers on the Overview are the same
tabs, so the day's work is one click from the first screen.

> **Cancel order** is only offered before an order ships, and it puts the stock
> back automatically. An order that disappears without returning its units is
> how a shop slowly loses inventory nobody can account for. A paid order still
> needs its refund.

---

## Answer a request to cancel

**Admin → Orders → open the order → Cancellation requested**

When your store asks customers to request a cancellation rather than cancel on their own, their request waits on
the order with the date and their reason. Their order page says the request is waiting.

- **Accept and cancel** cancels the order and gives back what was paid. A message is optional.
- **Decline** keeps the order going. Write a short reason: it is emailed to the customer and shown on their order
  page, and they cannot ask again.

---

## Create a discount code

**Discounts → New code**

- **Percentage off** — `10` means 10%
- **Fixed amount off** — in the smallest unit, so `1000` is $10.00
- **Free shipping** — waives delivery whatever the basket

Untick **Active** to switch a code off without deleting it, so you keep the
history.

---

## Fix a size chart everywhere at once

**Size charts → click one → edit the table → Save**

Charts are shared. Nine products pointing at **tops** all update together, rather
than nine copies of the same table drifting apart.

Attach one on a product under **Fit, size & fabric → Use chart** (the tab is named
for what the product type has). The menu offers **Size charts** only when a product
type in the store has a size chart.

---

## Finding things

Every list has the same three controls in the same place: **search**, one or two
**filters**, and a **sort**.

| Screen | Filter by | Sort by |
| --- | --- | --- |
| Products | Published, drafts, low stock, out of stock, on sale | Updated, name, price, stock |
| Inventory | All, low, out of stock | Stock, product, SKU |
| Orders | Status | Date, order value |
| Discounts | Active, inactive | — |
| Categories, Size charts | — | — |

A count under the controls tells you how much you are looking at. **Clear**
appears as soon as anything is set.

---

## Find the API details

**Developer docs** in the admin sidebar.

The whole reference is in there — endpoints, data shapes, the database schema,
and two prompts you can paste into an AI to have it build your backend or design
your database. Every code block has a copy button.

---

## Bulk update from another system

**Import / export**

**Download JSON** to back up everything. Feed the same file back through
**Choose a file** and it merges by slug — existing products updated, new ones
added, nothing deleted.

If another system (an ERP, a spreadsheet, a warehouse) should push updates
automatically, that is one call a night rather than a person clicking. Your
developer wants [ADMIN.md](ADMIN.md#bulk).

---

## Before you go live

- [ ] Real product photography (4:5 for products, 3:2 for collections, 16:9 hero)
- [ ] **Size measurements on every product** — the single biggest cause of
      returns is fit, and a measurement table is the cheapest fix there is
      ([why](CRO.md))
- [ ] Checkout switched off **demo**
- [ ] Free-shipping threshold, returns window and delivery times correct
- [ ] Store name, logo, support email
- [ ] Export a backup

---

## Something looks wrong

| Symptom | Usually |
| --- | --- |
| A change is not showing | Reload the shop tab. Settings are cached for a few minutes |
| A product vanished from the shop | Every size is at 0. Check **Inventory → Out of stock** |
| A category shows no products | Nothing is filed under it or its children yet |
| Prices look wrong by 100× | Free-shipping threshold is in the smallest unit; product prices are not |
| A new feature is missing from old products | Reload once. The store fills in fields it has gained, keeping your edits |
| An address will not save | The field in red is missing — usually **State / region** for India or the US. Pick it from the list |
| A product reopened with a *restored* bar | Your browser kept unsaved changes through a reload. **Save** or **Discard them** |
| Orders, Discounts or Import are missing from the admin | The shop runs on a real backend, which manages those itself |
| Everything is broken | **Import / export → Reset to demo data** starts fresh |
