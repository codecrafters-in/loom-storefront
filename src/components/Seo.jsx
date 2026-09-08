import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { toMajor } from '../lib/money.js'

/**
 * Per-route title, description, canonical, Open Graph and structured data.
 *
 * A single-page app serves one `index.html`, so without this every one of the
 * fifty-four URLs in the sitemap shares one title — which is the first thing a
 * merchant's marketer raises and the last thing anyone notices while building.
 *
 * Set at runtime rather than prerendered. Google executes JavaScript and reads
 * what ends up in the DOM; other crawlers and every link-preview scraper do not,
 * so a store that depends on search should prerender or server-render these
 * routes. That trade is stated in docs/PERFORMANCE.md rather than left as a
 * surprise.
 *
 * `product` triggers Product schema, which is what puts a price and a rating in
 * a search result. It is the highest-value markup a shop can emit and costs one
 * script tag.
 */
export default function Seo({ title, description, image, type = 'website', product, noindex = false }) {
  const config = useStorefront()
  const { pathname } = useLocation()

  useEffect(() => {
    const storeName = config.store?.name || 'LOOM'
    const full = title ? `${title} — ${storeName}` : `${storeName} — ${config.store?.tagline || ''}`.trim()
    const desc = description || config.store?.description || ''
    const url = typeof window !== 'undefined' ? `${window.location.origin}${pathname}` : pathname
    const img = image || '/og.jpg'

    document.title = full

    meta('name', 'description', desc)
    meta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    link('canonical', url)

    meta('property', 'og:title', full)
    meta('property', 'og:description', desc)
    meta('property', 'og:url', url)
    meta('property', 'og:type', type)
    meta('property', 'og:image', absolute(img))
    meta('property', 'og:site_name', storeName)
    meta('name', 'twitter:card', 'summary_large_image')
    meta('name', 'twitter:title', full)
    meta('name', 'twitter:description', desc)
    meta('name', 'twitter:image', absolute(img))

    jsonLd(product ? productSchema(product, url, config) : null)
  }, [title, description, image, type, product, noindex, pathname, config])

  return null
}

function absolute(url) {
  if (!url || /^https?:\/\//.test(url)) return url
  return typeof window !== 'undefined' ? `${window.location.origin}${url}` : url
}

function meta(attr, key, content) {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content || '')
}

function link(rel, href) {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

const LD_ID = 'seo-jsonld'

function jsonLd(data) {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(LD_ID)
  if (!data) {
    existing?.remove()
    return
  }
  const el = existing || document.createElement('script')
  el.id = LD_ID
  el.type = 'application/ld+json'
  el.textContent = JSON.stringify(data)
  if (!existing) document.head.appendChild(el)
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
  const currency = p.price?.currency || config.pricing?.currency || 'USD'
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
    brand: { '@type': 'Brand', name: config.store?.name },
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
