/**
 * The document head for one route, as data: what `<Seo>` records during a server render and applies in a browser.
 *
 * Pure (no React, no DOM), so the tests can run it and the server render and the browser build the identical head.
 */
const SCHEMA = 'https://schema.org'

/** `/fr` + `/shop` → `/fr/shop`; the home page of a language is `/fr`, not `/fr/`. */
export const addressOf = (prefix, pathname) => (prefix ? (pathname === '/' ? prefix : `${prefix}${pathname}`) : pathname)

/** A page's name through the store's title template (`{title} | {store}`), or "Title — Store" without one. */
export function titled(title, storeName, template) {
  if (!title) return ''
  if (template && template.includes('{title}')) return template.replaceAll('{title}', title).replaceAll('{store}', storeName).trim()
  return [title, storeName].filter(Boolean).join(' — ')
}

export const clean = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''))

/**
 * The head for one route, as a list of tags.
 *
 * Pure, so the server render can call it in Node and the browser can apply the identical result. `origin` is passed in
 * rather than read from `window` where there is none; a relative Open Graph image is ignored by every scraper.
 */
export function buildHead(props, schemas) {
  const { title, description, image, type = 'website', noindex = false, seo, pathname = '/', prefix = '', config, origin } = props
  const storeName = config?.store?.name || ''
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  const full =
    seo?.title ||
    titled(title, storeName, config?.seo?.titleTemplate) ||
    config?.seo?.title ||
    [storeName, config?.store?.tagline].filter(Boolean).join(' — ')
  const desc = seo?.description || description || config?.seo?.description || config?.store?.description || ''
  const url = `${base}${addressOf(prefix, pathname)}`
  const img = absolute(seo?.image || image || config?.seo?.image || config?.theme?.ogImageUrl || '/og.jpg', base)
  const hidden = Boolean(noindex || seo?.noindex || config?.seo?.indexable === false)

  return [
    { kind: 'title', text: full },
    { kind: 'meta', attr: 'name', key: 'description', content: desc },
    { kind: 'meta', attr: 'name', key: 'robots', content: hidden ? 'noindex, nofollow' : 'index, follow' },
    { kind: 'link', rel: 'canonical', href: url },
    ...(hidden ? [] : alternates(config, base, pathname)),
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
    // Structured data only with its builders (src/lib/schema.js): the server always has them; a browser loads them later.
    ...(schemas ? [structuredData(props, schemas)] : []),
  ]
}

/**
 * The page's JSON-LD tag: product, breadcrumbs, product list, article, and on the home page the store and its search.
 * `schemas` is src/lib/schema.js, passed in so the browser can load it after the page shows.
 */
export function structuredData(props, schemas) {
  const { product, breadcrumbs, itemList, article, site = false, pathname = '/', prefix = '', config, origin } = props
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '')
  const url = `${base}${addressOf(prefix, pathname)}`
  const graph = [
    product && schemas.productSchema(product, url, config, base),
    breadcrumbs?.length > 1 && schemas.breadcrumbSchema(breadcrumbs, base, prefix),
    itemList?.length && schemas.itemListSchema(itemList, base, prefix),
    article && schemas.articleSchema(article, url, config, base),
    ...(site ? schemas.siteSchema(config, base, prefix) : []),
  ].filter(Boolean)
  return {
    kind: 'jsonld',
    data: graph.length === 1 ? { '@context': SCHEMA, ...graph[0] } : graph.length ? { '@context': SCHEMA, '@graph': graph } : null,
  }
}

/**
 * The same page in each of the website's languages, and `x-default` for the store's own. The sitemap lists the same
 * alternates (Odoo), so a crawler finds them either way.
 */
function alternates(config, base, pathname) {
  const languages = config?.i18n?.languages || []
  if (languages.length < 2) return []
  const fallback = config.i18n.default || languages[0].urlCode
  const href = (code) => `${base}${code === fallback ? pathname : addressOf(`/${code}`, pathname)}`
  return [
    ...languages.filter((language) => language.urlCode).map((language) => ({ kind: 'link', rel: 'alternate', hreflang: language.urlCode, href: href(language.urlCode) })),
    { kind: 'link', rel: 'alternate', hreflang: 'x-default', href: `${base}${pathname}` },
  ]
}

export function absolute(url, base = '') {
  if (!url || /^https?:\/\//.test(url)) return url
  return `${base}${url}`
}

