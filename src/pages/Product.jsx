import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import api, { peek } from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import Promises from '../components/layout/Promises.jsx'
import { Breadcrumbs, Button, Empty, ErrorState, Icon, Rating, Skeleton } from '../components/ui/index.jsx'
import Seo from '../components/Seo.jsx'
import ProductView from '../components/product/ProductView.jsx'
import { useBootstrap, useStorefront } from '../store/StorefrontContext.jsx'
import { productTrail } from '../lib/categories.js'
import { viewItem } from '../lib/analytics.js'
import { remember } from '../lib/recentlyViewed.js'
import { useAuth } from '../store/AuthContext.jsx'
import RecentlyViewed from '../components/product/RecentlyViewed.jsx'

export default function Product() {
  const { slug } = useParams()
  // `initial` is what the prerenderer put in the page. Without it the first
  // client render paints a skeleton over markup the server already sent, and
  // React discards the whole prerendered tree as a mismatch.
  const { data: product, error, loading, reload } = useAsync(() => api.getProduct(slug), [slug], {
    initial: peek.getProduct(slug),
  })
  const config = useStorefront()
  const { customer } = useAuth()
  const recs = config.recommendations || {}
  const related = useAsync(
    () => api.getRelated(slug, { limit: recs.limit || 4, strategy: recs.strategy || 'automatic' }),
    [slug, recs.strategy, recs.limit],
    { skip: recs.strategy === 'off' },
  )
  const reviews = useAsync(() => api.getReviews(slug), [slug], {
    skip: config.features?.reviews === false,
  })
  // Category names, not slugs, to any depth: the product's own breadcrumbs, or
  // the deepest of its categories found in the tree the bootstrap already sent.
  const { categories: tree } = useBootstrap()
  const trail = useMemo(() => (product ? productTrail(product, tree) : []), [product, tree])

  // Keyed on the slug, so navigating between products reports each one — and
  // not on every render, which would report the same view a dozen times.
  useEffect(() => {
    if (!product) return
    viewItem(product)
    // Scoped to the signed-in customer. A shared laptop is the normal case in a
    // household, and a rail showing the last person's browsing is both a
    // privacy problem and a useless recommendation.
    if (config.features?.recentlyViewed !== false) remember(product.slug, customer?.id)
  }, [product?.slug, customer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <ProductSkeleton />
  if (error) {
    return (
      <div className="wrap wrap-tight py-24">
        {error.status === 404 ? (
          <Empty
            icon="search"
            title="We could not find that product"
            body="It may have sold out and been retired."
            action={<Button to="/shop">Browse everything</Button>}
          />
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )}
      </div>
    )
  }

  return (
    <>
      <Seo
        title={product.title}
        description={product.subtitle ? `${product.subtitle}. ${product.description}`.slice(0, 300) : product.description?.slice(0, 300)}
        image={product.images?.[0]?.url}
        type="product"
        product={product}
      />
      <div className="wrap wrap-tight pt-8">
        <Breadcrumbs
          trail={[
            { label: 'Home', to: '/' },
            { label: 'Shop', to: '/shop' },
            ...trail.map((c) => ({ label: c.name, to: `/shop/${c.slug}` })),
            { label: product.title },
          ]}
        />
      </div>

      {/* Enrichment used to be a full-width section here. It now sits in the
          buy column inside ProductView — everything that decides a purchase
          belongs beside the button, not below it. */}
      {/* Keyed on the product, so moving from one product to another starts the
          picker afresh rather than carrying one product's choices into the next. */}
      <ProductView key={product.slug} product={product} />

      {/* The store's own "goes with it", when it has chosen some. Without them
          this rail is not shown and the related rail below is what the page
          offers, as it always did. */}
      {product.accessories?.length > 0 && (
        <section className="wrap wrap-tight pb-16">
          <h2 className="text-display-md">Frequently bought together</h2>
          <div className="mt-8">
            <ProductGrid products={product.accessories} />
          </div>
        </section>
      )}

      {/* reviews */}
      {config.features?.reviews !== false && (
      <section id="reviews" className="border-t border-line bg-surface">
        <div className="wrap wrap-tight grid gap-10 py-16 md:grid-cols-[18rem_1fr]">
          <div>
            <h2 className="text-display-md">Reviews</h2>
            {reviews.data?.summary && (
              <>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="font-display text-4xl">{reviews.data.summary.average}</span>
                  <Rating value={reviews.data.summary.average} showCount={false} size={15} />
                </div>
                <p className="mt-2 text-[13px] text-faint">
                  {reviews.data.summary.count} reviews
                  {reviews.data.summary.withPhotos > 0 && ` · ${reviews.data.summary.withPhotos} with photos`}
                </p>
                <ul className="mt-6 space-y-1.5">
                  {reviews.data.summary.breakdown.map((b) => (
                    <li key={b.stars} className="flex items-center gap-2.5 text-[12px] text-faint">
                      <span className="w-3 tabular-nums">{b.stars}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${(b.count / reviews.data.summary.count) * 100}%` }}
                        />
                      </span>
                      <span className="w-8 text-right tabular-nums">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <ul className="divide-y divide-line">
            {(reviews.data?.items || []).map((r) => (
              <li key={r.id} className="py-6 first:pt-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Rating value={r.rating} showCount={false} size={12} />
                  <span className="text-[13px] font-medium">{r.author}</span>
                  {r.verified && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-good">
                      <Icon name="check" size={11} /> Verified
                    </span>
                  )}
                  <time className="ml-auto text-[12px] text-faint" dateTime={r.createdAt}>
                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </time>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-muted">{r.body}</p>
                {(r.size || r.height || r.fit) && (
                  <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-faint">
                    {r.size && <span>Bought size <span className="text-muted">{r.size}</span></span>}
                    {r.height && <span>Height <span className="text-muted">{r.height}</span></span>}
                    {r.fit && (
                      <span>
                        Fit{' '}
                        <span className={r.fit === 'true' ? 'text-good' : 'text-muted'}>
                          {r.fit === 'true' ? 'true to size' : `runs ${r.fit}`}
                        </span>
                      </span>
                    )}
                  </p>
                )}
                {r.photos?.length > 0 && (
                  <ul className="mt-3 flex gap-2">
                    {r.photos.map((ph, i) => (
                      <li key={i} className="w-16">
                        <div className="shot rounded-xs"><img src={ph.url} alt="Customer photo" loading="lazy" /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
      )}

      {/* related */}
      {/* The store's alternatives when it named them, computed recommendations when it did not. */}
      {(product.alternatives?.length > 0 || related.data?.items?.length > 0) && (
        <section className="wrap wrap-tight py-16">
          <h2 className="text-display-md">{recs.title || 'You might also like'}</h2>
          <div className="mt-8">
            <ProductGrid products={product.alternatives?.length ? product.alternatives : related.data.items} />
          </div>
        </section>
      )}

      <RecentlyViewed exclude={product.slug} />

      <Promises />

    </>
  )
}

function ProductSkeleton() {
  return (
    <div className="wrap wrap-tight mt-12 grid gap-10 pb-20 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-12">
      <Skeleton className="aspect-[4/5] w-full" />
      <div>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-4 w-1/3" />
        <Skeleton className="mt-8 h-6 w-24" />
        <Skeleton className="mt-8 h-24 w-full" />
        <Skeleton className="mt-8 h-11 w-48" />
        <Skeleton className="mt-6 h-[52px] w-full" />
      </div>
    </div>
  )
}
