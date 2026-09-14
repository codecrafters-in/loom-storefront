# Deploying

A **live store** (`VITE_DATA_SOURCE=api`) is two things after `npm run build`:

- `dist/`: the JavaScript, CSS, images and icons, served as static files;
- `server-build/`: the storefront's server bundle, which the **render handler** (`server/handler.mjs`) uses to render
  every page when it is asked for.

The render handler is what makes a product added in Odoo a minute ago a real page for Google and for link previews:

| Address | Answer |
| --- | --- |
| A product, category, collection, brand, page, blog post, the shop or the home page | `200` with the page's title, description, canonical link, Open Graph tags, structured data and the data it was rendered from (the browser adopts that markup instead of painting it again) |
| An old address from Odoo's **Redirects** (a changed slug) | `301` to the new one, with the language prefix kept |
| An address that is nothing | `404` with the not-found page, `X-Robots-Tag: noindex` |
| Any address while the store is in maintenance | `503` with `Retry-After`, the maintenance screen |
| Bag, checkout, account, sign-in, saved items, search, admin | the app, rendered in the shopper's browser, never cached |
| `/robots.txt`, `/sitemap.xml`, `/sitemaps/…` | Odoo's, from the store's SEO settings and the live catalogue |

Every page carries its own `Content-Security-Policy` header, and caching headers for the CDN in front (below).

The **demo** (`VITE_DATA_SOURCE=mock`) is still written out as files (`scripts/prerender.mjs`) and runs on any static
host; the adapters below serve it too.

## Settings

Set at **build** time (Vite puts them into the bundle):

| Variable | Meaning |
| --- | --- |
| `VITE_DATA_SOURCE` | `api` for a live store |
| `VITE_API_BASE_URL` | The store's API, e.g. `https://odoo.example.com/loom/api/v1/shop` (**Store › Connection** in Odoo) |

Read at **run** time by the render handler (all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `SITE_URL` | the address the request came in on | The storefront's public origin, e.g. `https://shop.example.com`, for canonical links and Open Graph URLs. Set it when a proxy changes the host |
| `LOOM_CDN_SECONDS` | `120` | How long the CDN keeps a rendered page before rendering it again |
| `LOOM_STALE_SECONDS` | `86400` | How long the CDN may keep serving the previous copy while it renders a fresh one |
| `LOOM_API_ETAGS` | `on` | `off` stops remembering Odoo's answers between renders (`If-None-Match`) |
| `PORT` | `3000` | Node server only |

In Odoo, the store's **Storefront URL** must be the deployed origin: Odoo allows the storefront's calls from it (CORS),
sends shoppers back to it from payment, and writes it into the sitemap.

**How long an edit takes to show.** Shoppers' browsers always ask again, so a reload never shows an old price once the
CDN has a fresh copy. The CDN keeps a page for `LOOM_CDN_SECONDS` (2 minutes by default) and then renders it again in
the background. Lower it for a store that changes by the minute; raise it for a very busy one. Your host's "purge
cache" button refreshes everything at once.

## Vercel

The repository is ready: `vercel.json` sends every address without a file to `api/render.js` and includes
`server-build/` in that function.

1. Import the repository in Vercel. Framework preset: **Vite** (build command `npm run build`, output `dist`).
2. **Settings › Environment Variables:** `VITE_DATA_SOURCE=api`, `VITE_API_BASE_URL`, and `SITE_URL` with your domain.
3. Deploy, then add your domain and set it as the store's **Storefront URL** in Odoo.

Vercel caches rendered pages at its edge for `LOOM_CDN_SECONDS` (`CDN-Cache-Control`).

## Netlify

`netlify.toml` and `netlify/functions/render.mjs` are in the repository. The function answers every address that has no
file in `dist/` (`preferStatic`).

1. **Add new site › Import an existing project**. Netlify reads the build command and publish directory from
   `netlify.toml`.
2. **Site configuration › Environment variables:** `VITE_DATA_SOURCE=api`, `VITE_API_BASE_URL`, `SITE_URL`.
3. Deploy, then set the domain as the store's **Storefront URL** in Odoo.

## Cloudflare Pages

`functions/[[path]].js` renders pages and hands files to the static assets. Rendered pages are kept in Cloudflare's
cache for `LOOM_CDN_SECONDS`.

1. **Workers & Pages › Create › Pages › Connect to Git.** Build command `npm run build`, output directory `dist`.
2. **Settings › Variables and secrets:** `VITE_DATA_SOURCE=api`, `VITE_API_BASE_URL` (both also as build variables),
   `SITE_URL`.
3. **Settings › Runtime › Compatibility flags:** add `nodejs_compat` (the handler uses `node:crypto` for the policy
   hashes). Use a compatibility date from 2024-09-23 or later.
4. Deploy, then set the domain as the store's **Storefront URL** in Odoo.

## Node server or Docker (any VPS)

```bash
npm ci
VITE_DATA_SOURCE=api VITE_API_BASE_URL=https://odoo.example.com/loom/api/v1/shop npm run build
SITE_URL=https://shop.example.com PORT=3000 npm start
```

`server/node.mjs` serves `dist/` (hashed assets cached for a year) and renders everything else. Keep it running with
systemd or pm2. With Docker:

```bash
docker build -t loom-storefront \
  --build-arg VITE_API_BASE_URL=https://odoo.example.com/loom/api/v1/shop .
docker run -p 3000:3000 -e SITE_URL=https://shop.example.com loom-storefront
```

Put nginx (or Caddy, or a CDN) in front for HTTPS. nginx can cache rendered pages itself:

```nginx
proxy_cache_path /var/cache/loom keys_zone=loom:10m max_size=1g inactive=1d;

server {
  server_name shop.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache loom;
    proxy_cache_valid 200 2m;
    proxy_cache_valid 404 1m;
    proxy_cache_use_stale updating error timeout;
    proxy_cache_background_update on;
    proxy_ignore_headers Cache-Control;
    proxy_no_cache $http_authorization;
  }
}
```

Private pages (bag, checkout, account) answer `Cache-Control: private, no-store`; with `proxy_ignore_headers
Cache-Control` add `proxy_no_cache $upstream_http_cache_control ~ private;` via a `map`, or leave `proxy_cache` off and
use a CDN.

## Check a deployment

```bash
curl -sI https://shop.example.com/product/<a-product-slug>         # 200, cdn-cache-control
curl -s  https://shop.example.com/product/<a-product-slug> | grep -o '<title>[^<]*'
curl -sI https://shop.example.com/product/no-such-product          # 404
curl -s  https://shop.example.com/robots.txt                        # Odoo's, with the sitemap address
```

Then submit `https://shop.example.com/sitemap.xml` in Google Search Console. The end-to-end suite's S-12 checks all of
this against a deployment: `LOOM_E2E_CRAWL_URL=https://shop.example.com npm run e2e -- tests/s12*`.
