# Recipes

Mapping notes for common backends. In every case you are writing a thin
translation layer, not a new system — the storefront already exists.

For the fastest start, paste [INTEGRATION-PROMPT.md](INTEGRATION-PROMPT.md) into
a coding agent with your system named at the top.

---

## Odoo

The most common request, and a good fit — Odoo already models everything the
contract needs.

| Contract | Odoo |
| --- | --- |
| Product | `product.template` |
| Variant | `product.product` |
| `options` | `product.attribute` + `product.attribute.value` |
| Category | `product.public.category` (or `product.category`) |
| Cart | `sale.order` with `state = 'draft'` |
| Order | `sale.order` with `state = 'sale'` |
| Customer / Address | `res.partner` (`type = 'delivery'` for shipping) |
| Discount code | `loyalty.program` / `coupon.program` |
| Stock | `qty_available` on `product.product` |

**Expose a controller, not JSON-RPC.** JSON-RPC is awkward to call from a
browser, hard to make public safely, and returns Odoo-shaped payloads you would
have to translate client-side anyway.

```python
# models are read with sudo() for the public catalogue only — never for carts,
# orders or anything under /me.
from odoo import http
from odoo.http import request

class StorefrontController(http.Controller):

    @http.route('/api/storefront/v1/products', type='http', auth='public',
                methods=['GET', 'OPTIONS'], csrf=False, cors='*')
    def products(self, **kw):
        domain = [('is_published', '=', True)]
        if kw.get('category'):
            # A parent must include its descendants, or /shop/shirts is empty
            # while /shop/shirts-linen is not.
            cat = request.env['product.public.category'].sudo().search(
                [('slug', '=', kw['category'])], limit=1)
            ids = cat.search([('id', 'child_of', cat.id)]).ids
            domain.append(('public_categ_ids', 'in', ids))

        page = int(kw.get('page', 1))
        per_page = min(int(kw.get('per_page', 12)), 48)
        Product = request.env['product.template'].sudo()
        total = Product.search_count(domain)
        records = Product.search(domain, limit=per_page, offset=(page - 1) * per_page)

        return request.make_json_response({
            'items': [self._product(p) for p in records],
            'total': total, 'page': page, 'perPage': per_page,
            # Facets over the whole category, never over the filtered page.
            'facets': self._facets(domain),
        })

    def _money(self, amount, currency):
        # list_price is a float. Convert once, here, and nowhere else.
        return {'amount': int(round(amount * 100)), 'currency': currency.name}
```

Two traps specific to Odoo:

1. **`list_price` is a float.** Convert to minor units at the boundary and never
   let a float reach the API surface.
2. **CORS.** Odoo does not send CORS headers by default. Set `cors='*'` on the
   route (tighten to your storefront origin in production) and handle `OPTIONS`.

If `website_sale` is installed, `product.public.category`, `sale.order` as a
cart, and the coupon programs are all already wired — you are mostly renaming
fields.

**Where the apparel fields live.** `fit`, `fabric` and `sizeChart` have no
native home. Two options: add fields to `product.template` in your module, or
use `product.attribute` values and read them back. The first is cleaner and it
is what an admin panel would edit.

---

## Shopify

Translate the Storefront GraphQL API. Never proxy the Admin API from a browser.

| Contract | Shopify |
| --- | --- |
| Product | `Product` |
| Variant | `ProductVariant` |
| `options` | `Product.options` |
| Cart | `Cart` (Cart API) |
| Order | `Order` via Customer Account API |
| Category | `Collection` |

Money is `{ amount: "128.00", currencyCode: "USD" }` — a **decimal string**.
Multiply by 100 and round.

`Product.metafields` is where `fit`, `fabric` and `sizeChart` live. Define them
as a metafield definition so they are editable in admin.

Shopify collections are flat with no parent, so build the category tree from a
metafield or a naming convention.

---

## Medusa

The closest match of any platform. Money is already integer minor units,
variants and options map one to one, carts and orders line up. Mostly renaming
fields and reshaping list responses to `{ items, total, page, perPage }`.

Custom apparel fields go in `metadata` on the product, or a custom entity if you
want them queryable.

---

## WooCommerce

The REST API (`/wp-json/wc/v3`) covers products, variations, orders and coupons.

- Prices are decimal strings — convert.
- Variations are separate objects (`/products/:id/variations`); assemble
  `options` and `variants` yourself.
- Categories have `parent`, so the tree is straightforward.
- Custom fields go in `meta_data`.
- Authenticate server-side. Consumer keys must never reach a browser.

---

## Headless CMS (Strapi, Sanity, Payload)

Fine for the catalogue, not for cart and orders — you need real inventory
decrements and a transaction. A common split:

- **CMS** serves `/products`, `/categories`, `/collections`, `/storefront`
- **Payment provider or a small service** serves `/carts`, `/checkout`, `/orders`

Point `VITE_API_BASE_URL` at a thin gateway that fans out to both.

---

## Nothing yet

The minimum schema to open a store:

```sql
products     (id, slug, title, subtitle, description, price_minor, currency,
              compare_at_minor, category_slug, tags, rating_avg, rating_count,
              created_at)
product_images  (product_id, url, alt, width, height, position)
variants     (id, product_id, sku, options_json, price_minor, inventory)
categories   (slug, name, parent_slug, blurb, image_url)
carts        (id, currency, discount_code, created_at)
cart_lines   (id, cart_id, variant_id, quantity, unit_price_minor)
orders       (id, number, status, email, address_json, totals_json, placed_at)
order_lines  (order_id, variant_id, title, options_json, quantity, unit_price_minor)
customers    (id, email, password_hash, first_name, last_name, phone)
addresses    (id, customer_id, name, line1, line2, city, region, postal_code,
              country, phone, is_default)
```

Add `fit_json`, `fabric_json` and `size_chart_id` to `products` when you have the
data. Ten tables and you have a storefront.

---

## Checklist before going live

- [ ] Prices are integers in minor units everywhere
- [ ] CORS allows your storefront origin and the `authorization` header
- [ ] Facets computed over the whole category, not the filtered page
- [ ] Parent categories include descendants when filtering and counting
- [ ] Cart repriced server-side on every mutation
- [ ] Checkout repriced and re-stock-checked before creating anything
- [ ] Payment confirmed by webhook, not by the success redirect
- [ ] `GET /me` returns 401 when signed out, and that is not logged as an error
- [ ] Every product has at least two images with real `alt` text
- [ ] Sold-out products return variants with `available: false`, not `[]`
