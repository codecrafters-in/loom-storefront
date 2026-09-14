/**
 * schema.org structured data for a page (src/lib/seo.js `structuredData`).
 *
 * Its own module: the server render includes it in every page's HTML, which is what crawlers read, while a browser
 * loads it after the page shows, so it is not part of the first download.
 */
import { toMajor } from './money.js'
import { absolute, addressOf, clean } from './seo.js'

const currencyCode = (value) => (value && typeof value === 'object' ? value.code : value)
const countryCodes = (config) =>
  (config?.commerce?.countries || []).map((country) => (Array.isArray(country) ? country[0] : country?.code || country)).filter((code) => typeof code === 'string')

/** The store's returns window, for the offers. Google shows it next to the price. */
function returnPolicy(config) {
  const days = Number(config?.commerce?.returnsWindowDays)
  const countries = countryCodes(config)
  if (!days || !countries.length) return undefined
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: countries.slice(0, 50),
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: days,
    returnMethod: 'https://schema.org/ReturnByMail',
  }
}

/** Free delivery, when this price is over the store's free delivery threshold. Nothing is claimed otherwise. */
function freeShipping(config, amount, currency) {
  const over = config?.commerce?.freeShippingOver
  const countries = countryCodes(config)
  if (over == null || !Number.isFinite(amount) || amount < over || !countries.length) return undefined
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: 0, currency },
    shippingDestination: countries.slice(0, 50).map((code) => ({ '@type': 'DefinedRegion', addressCountry: code })),
  }
}

/**
 * schema.org Product.
 *
 * One `Offer` per variant (with its SKU and barcode as GTIN) inside an `AggregateOffer` when there are several, so a
 * search result can show a price range and each size is matched to its own barcode. `availability` comes from real
 * stock rather than being assumed — claiming availability you do not have is a way to get rich results suspended.
 */
export function productSchema(p, url, config, base) {
  // No assumed currency: a price without one is left out rather than claimed in dollars.
  const currency = currencyCode(p.price?.currency || config?.pricing?.currency)
  const variants = (p.variants || []).filter((v) => Number.isFinite(v.price?.amount))
  const prices = variants.map((v) => v.price.amount)
  const low = prices.length ? Math.min(...prices) : p.price?.amount
  const high = prices.length ? Math.max(...prices) : p.price?.amount
  const inStock = (p.variants || []).some((v) => v.available)
  const availability = (available) => (available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock')
  const policy = returnPolicy(config)
  const major = (amount) => toMajor({ amount, currency })

  const offerOf = (v) =>
    clean({
      '@type': 'Offer',
      url,
      name: v.options ? Object.values(v.options).join(' / ') : undefined,
      sku: v.sku,
      gtin: v.barcode,
      price: major(v.price.amount),
      priceCurrency: currency,
      availability: availability(v.available),
      itemCondition: 'https://schema.org/NewCondition',
      shippingDetails: freeShipping(config, v.price.amount, currency),
      hasMerchantReturnPolicy: policy,
    })

  const single = variants.length === 1 ? variants[0] : null
  const offers =
    variants.length > 1
      ? clean({
          '@type': 'AggregateOffer',
          url,
          lowPrice: major(low),
          highPrice: major(high),
          priceCurrency: currency,
          offerCount: variants.length,
          availability: availability(inStock),
          offers: variants.map(offerOf),
        })
      : single
        ? offerOf(single)
        : clean({
            '@type': 'Offer',
            url,
            price: Number.isFinite(low) ? major(low) : undefined,
            priceCurrency: currency,
            availability: availability(inStock),
            hasMerchantReturnPolicy: policy,
          })

  const schema = clean({
    '@type': 'Product',
    name: p.title,
    description: p.description,
    sku: p.variants?.[0]?.sku,
    gtin: single?.barcode,
    image: (p.images || []).filter((i) => i.type !== 'video').map((i) => absolute(i.url, base)),
    // The maker when the product names one — a phone is not made by the shop that sells it — and the store for its own goods.
    brand: { '@type': 'Brand', name: p.brand?.name || config?.store?.name },
    offers,
  })

  // Only claim a rating that exists. An aggregateRating with zero reviews is a structured-data error and a manual
  // action waiting to happen.
  if (p.rating?.count > 0) {
    schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count }
  }
  if (p.fabric?.composition?.length) schema.material = p.fabric.composition.map(([m]) => m).join(', ')
  if (p.fabric?.origin) schema.countryOfOrigin = p.fabric.origin
  return schema
}

/** `[{name, path}]`, home first; the last one (the page itself) may have no path. */
export function breadcrumbSchema(items, base, prefix) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) =>
      clean({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.path ? `${base}${addressOf(prefix, item.path)}` : undefined }),
    ),
  }
}

export function itemListSchema(products, base, prefix) {
  return {
    '@type': 'ItemList',
    itemListElement: products.slice(0, 50).map((p, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${base}${addressOf(prefix, `/product/${p.slug}`)}`,
      name: p.title,
    })),
  }
}

export function articleSchema(post, url, config, base) {
  const logo = config?.store?.logo?.imageUrl
  return clean({
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.teaser,
    datePublished: post.publishedAt,
    author: post.author ? { '@type': 'Person', name: post.author } : undefined,
    image: post.image?.url ? [absolute(post.image.url, base)] : undefined,
    mainEntityOfPage: url,
    publisher: clean({ '@type': 'Organization', name: config?.store?.name, logo: logo ? absolute(logo, base) : undefined }),
  })
}

/** The home page: who the store is (logo, social profiles) and how to search it (a sitelinks search box). */
export function siteSchema(config, base, prefix) {
  const home = `${base}${addressOf(prefix, '/')}`
  const logo = config?.store?.logo?.imageUrl
  const sameAs = (config?.store?.contact?.social || []).map((link) => link?.url).filter(Boolean)
  const organization = clean({
    '@type': 'Organization',
    name: config?.store?.name,
    url: home,
    logo: logo ? absolute(logo, base) : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  })
  const website = clean({
    '@type': 'WebSite',
    name: config?.store?.name,
    url: home,
    potentialAction:
      config?.features?.search === false
        ? undefined
        : {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${base}${addressOf(prefix, '/search')}?q={search_term_string}` },
            'query-input': 'required name=search_term_string',
          },
  })
  return [organization, website]
}
