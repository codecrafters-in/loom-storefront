import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { toMajor } from '../lib/money.js'
import { applyHead, collecting, record } from '../lib/head.js'

/**
 * Per-route title, description, canonical, Open Graph and structured data.
 *
 * A single-page app serves one `index.html`, so without this every one of the
 * fifty-four URLs in the sitemap shares one title — which is the first thing a
 * merchant's marketer raises and the last thing anyone notices while building.
 *
 * The head is built as *data* and then either applied to a real document or
 * handed to the prerenderer. Google executes JavaScript and would eventually
 * read tags set in an effect; no other crawler and no link-preview scraper
 * does, which is why `npm run build` writes these into the HTML.
 *
 * Recording during render rather than in an effect is deliberate and is the
 * only way this can work: effects do not run during a server render, so a head
 * assembled in one is a head the prerenderer never sees.
 *
 * `product` triggers Product schema, which is what puts a price and a rating in
 * a search result. It is the highest-value markup a shop can emit and costs one
 * script tag.
 */
export default function Seo({ title, description, image, type = 'website', product, noindex = false }) {
  const config = useStorefront()
  const { pathname } = useLocation()

  const tags = useMemo(
    () => buildHead({ title, description, image, type, product, noindex, pathname, config }),
    [title, description, image, type, product, noindex, pathname, config],
  )

  // During a server render there is no document and no effect. Collect instead.
  if (collecting()) record(tags)

  useEffect(() => applyHead(tags), [tags])

  return null
}

/**
 * The head for one route, as a list of tags.
 *
 * Pure, so the prerenderer can call it in Node and the browser can apply the
 * identical result. `origin` is passed in rather than read from `window`,
 * because at build time there is no window and a relative Open Graph image is
 * ignored by every scraper that reads it.
 */
export function buildHead({ title, description, image, type = 'website', product, noindex = false, pathname, config, origin }) {
  const storeName = config?.store?.name || ''
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  const full = title
    ? [title, storeName].filter(Boolean).join(' — ')
    : [storeName, config?.store?.tagline].filter(Boolean).join(' — ')
  const desc = description || config?.store?.description || ''
  const url = `${base}${pathname}`
  const img = absolute(image || config?.theme?.ogImageUrl || '/og.jpg', base)

  return [
    { kind: 'title', text: full },
    { kind: 'meta', attr: 'name', key: 'description', content: desc },
    { kind: 'meta', attr: 'name', key: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow' },
    { kind: 'link', rel: 'canonical', href: url },
    { kind: 'meta', attr: 'property', key: 'og:title', content: full },
    { kind: 'meta', attr: 'property', key: 'og:description', content: desc },
    { kind: 'meta', attr: 'property', key: 'og:url', content: url },
    { kind: 'meta', attr: 'property', key: 'og:type', content: type },
    { kind: 'meta', attr: 'property', key: 'og:image', content: img },
    { kind: 'meta', attr: 'property', key: 'og:site_name', content: storeName },
    { kind: 'meta', attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
    { kind: 'meta', attr: 'name', key: 'twitter:title', content: full },
    { kind: 'meta', attr: 'name', key: 'twitter:description', content: desc },
    { kind: 'meta', attr: 'name', key: 'twitter:image', content: img },
    { kind: 'jsonld', data: product ? productSchema(product, url, config) : null },
  ]
}

function absolute(url, base = '') {
  if (!url || /^https?:\/\//.test(url)) return url
  return `${base}${url}`
}





/**
 * schema.org Product.
 *
 * `offers` uses AggregateOffer when variants differ in price, and the low/high
 * pair is what a search result renders as a range. `availability` is derived
 * from real stock rather than assumed in stock — claiming availability you do
 * not have is a way to get rich results suspended.
 */
function productSchema(p, url, config) {
  // No assumed currency: a price without one is left out rather than claimed in dollars.
  const currency = p.price?.currency || config.pricing?.currency
  const prices = (p.variants || []).map((v) => v.price?.amount).filter(Number.isFinite)
  const low = prices.length ? Math.min(...prices) : p.price?.amount
  const high = prices.length ? Math.max(...prices) : p.price?.amount
  const inStock = (p.variants || []).some((v) => v.available)

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: p.description,
    sku: p.variants?.[0]?.sku,
    image: (p.images || []).map((i) => absolute(i.url)),
    // The maker when the product names one — a phone is not made by the shop
    // that sells it — and the store for its own goods.
    brand: { '@type': 'Brand', name: p.brand?.name || config.store?.name },
    offers:
      low === high
        ? {
            '@type': 'Offer',
            url,
            price: toMajor({ amount: low, currency }),
            priceCurrency: currency,
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          }
        : {
            '@type': 'AggregateOffer',
            url,
            lowPrice: toMajor({ amount: low, currency }),
            highPrice: toMajor({ amount: high, currency }),
            priceCurrency: currency,
            offerCount: prices.length,
            availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          },
  }

  // Only claim a rating that exists. An aggregateRating with zero reviews is a
  // structured-data error and a manual action waiting to happen.
  if (p.rating?.count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: p.rating.average,
      reviewCount: p.rating.count,
    }
  }

  if (p.fabric?.composition?.length) {
    schema.material = p.fabric.composition.map(([m]) => m).join(', ')
  }
  if (p.fabric?.origin) schema.countryOfOrigin = p.fabric.origin

  return schema
}
