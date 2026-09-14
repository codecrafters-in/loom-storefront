import { useEffect, useState } from 'react'
import api from '../../lib/api/index.js'
import { recent, onRecentChange } from '../../lib/recentlyViewed.js'
import { useAuth } from '../../store/AuthContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import ProductGrid from './ProductGrid.jsx'
import { t } from '../../i18n/index.js'

/**
 * The rail of what this person was just looking at.
 *
 * Slugs are stored; products are fetched. A cached title and price go stale and
 * the rail would show yesterday's price beside today's — and anything since
 * unpublished quietly drops out instead of 404ing from a row of links.
 *
 * `exclude` is the product being looked at right now. Without it the first tile
 * on every product page is the page you are on.
 *
 * Renders nothing below two items. One lonely tile under a heading reads as a
 * broken carousel, and telling somebody what they just clicked is not a
 * recommendation.
 */
export default function RecentlyViewed({ exclude, title = t('Recently viewed'), limit = 6 }) {
  const { customer } = useAuth()
  const config = useStorefront()
  const enabled = config.features?.recentlyViewed !== false
  const customerId = customer?.id || null

  const [slugs, setSlugs] = useState([])
  const [products, setProducts] = useState([])

  useEffect(() => {
    if (!enabled) return undefined
    const load = () => setSlugs(recent(customerId).map((entry) => entry.slug))
    load()
    // Browsing in another tab is still this person browsing.
    return onRecentChange(customerId, load)
  }, [customerId, enabled])

  useEffect(() => {
    const wanted = slugs.filter((slug) => slug !== exclude).slice(0, limit)
    if (!wanted.length) {
      setProducts([])
      return undefined
    }
    let alive = true
    Promise.all(wanted.map((slug) => api.getProduct(slug).catch(() => null))).then((items) => {
      if (alive) setProducts(items.filter(Boolean))
    })
    return () => {
      alive = false
    }
  }, [slugs, exclude, limit])

  if (!enabled || products.length < 2) return null

  return (
    <section className="wrap wrap-tight py-16">
      <h2 className="text-display-md">{title}</h2>
      <div className="mt-8">
        <ProductGrid products={products} />
      </div>
    </section>
  )
}
