# User guide

For whoever runs the shop. Ten tasks, one screen each.

> Everything here is at **`/admin`**. Sign in with `admin` / `admin` on the demo.
> Changes are live immediately — there is no publish button.

Once you are signed in, an **Admin** link appears in the shop's footer so you can
move between the two. Shoppers never see it.

---

## Add a product

**Products → New**

Five tabs, filled in the order you would think about them:

| Tab | What goes in it |
| --- | --- |
| **Details** | Title, slug, description, price, the Details and Care lists |
| **Media** | Images. First is the card, second is the hover shot |
| **Variants** | Colours with swatches, sizes, then **Rebuild matrix** |
| **Fit & fabric** | Fit verdict, model, size chart, composition, certifications |
| **Organise** | Categories, tags, rating |

Colours and sizes come first, then **Rebuild matrix** creates one row per
combination. Fill in stock per row.

> Rebuilding keeps everything you already typed. Adding a fourth colour does not
> wipe the stock counts on the first three.

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

## Take real payments

**Storefront → Checkout → Mode**

- **demo** — places a fake order. What you have now
- **redirect** — sends the customer to Stripe, Razorpay or whoever takes your
  money. **This is what a real shop uses**
- **api** — for invoicing, cash on delivery or wholesale terms

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

**Orders → change the status dropdown**

`placed` → `paid` → `fulfilled` → `delivered`, or `cancelled`.

> Cancelling puts the stock back automatically. An order that disappears without
> returning its units is how a shop slowly loses inventory nobody can account
> for.

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

Attach one on a product under **Fit & fabric → Use chart**.

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
| Everything is broken | **Import / export → Reset to demo data** starts fresh |
