import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import ProductGrid from '../components/product/ProductGrid.jsx'
import Promises from '../components/layout/Promises.jsx'
import {
  Badge, Breadcrumbs, Button, Empty, ErrorState, Icon, Price, QuantityStepper, Rating, Skeleton,
} from '../components/ui/index.jsx'
import { useCart } from '../store/CartContext.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import { FitBlock, FabricBlock, SizeChartModal } from '../components/product/FitBlock.jsx'
import TrustRow, { SocialProof } from '../components/product/TrustRow.jsx'

export default function Product() {
  const { slug } = useParams()
  const { data: product, error, loading, reload } = useAsync(() => api.getProduct(slug), [slug])
  const config = useStorefront()
  const recs = config.recommendations || {}
  const related = useAsync(
    () => api.getRelated(slug, { limit: recs.limit || 4, strategy: recs.strategy || 'automatic' }),
    [slug, recs.strategy, recs.limit],
    { skip: recs.strategy === 'off' },
  )
  const reviews = useAsync(() => api.getReviews(slug), [slug], {
    skip: config.features?.reviews === false,
  })

  const [params, setParams] = useSearchParams()
  const [color, setColor] = useState(null)
  const [size, setSize] = useState(null)
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)
  const [tab, setTab] = useState('details')
  const [chartOpen, setChartOpen] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const buyRef = useRef(null)

  const { add, busy } = useCart()
  const { has, toggle } = useWishlist()

  const colors = useMemo(
    () => product?.options.find((o) => o.name === 'Color')?.values || [],
    [product],
  )
  const sizes = useMemo(
    () => product?.options.find((o) => o.name === 'Size')?.values || [],
    [product],
  )
  /**
   * Default to the first colour that is actually buyable.
   *
   * Falling back to `colors[0]` looks harmless until the first colourway sells
   * out, at which point every visitor lands on a product where every size is
   * struck through and concludes the whole thing is gone.
   */
  const firstInStock = useMemo(() => {
    if (!product) return null
    return (
      colors.find((c) => product.variants.some((v) => v.options.Color === c && v.available)) ||
      colors[0] ||
      null
    )
  }, [product, colors])
  const activeColor = color ?? firstInStock

  /** Which sizes are actually buyable in the chosen colour — greying these out
   *  is the difference between a picker and a guessing game. */
  const sizeAvailability = useMemo(() => {
    if (!product) return {}
    return Object.fromEntries(
      sizes.map((s) => [
        s,
        product.variants.find((v) => v.options.Color === activeColor && v.options.Size === s)?.inventory ?? 0,
      ]),
    )
  }, [product, sizes, activeColor])

  const variant = product?.variants.find(
    (v) => v.options.Color === activeColor && v.options.Size === size,
  )

  /** Which colours have nothing left at all — struck through rather than hidden. */
  const colorSoldOut = useMemo(() => {
    if (!product) return {}
    return Object.fromEntries(
      colors.map((c) => [c, !product.variants.some((v) => v.options.Color === c && v.available)]),
    )
  }, [product, colors])

  /**
   * Changing colour keeps the size when that size still exists in the new
   * colour. Clearing it every time makes the picker feel like it is fighting
   * you, and it is the most common thing to get wrong in a variant selector.
   */
  const pickColor = (c) => {
    setColor(c)
    const stillThere = product.variants.find(
      (v) => v.options.Color === c && v.options.Size === size && v.available,
    )
    if (!stillThere) setSize(null)
  }

  // The selected variant lives in the URL, so a shared link, an ad or a
  // back button all land on the exact colour and size that was chosen.
  useEffect(() => {
    if (!variant) return
    const next = new URLSearchParams(params)
    if (next.get('variant') === variant.id) return
    next.set('variant', variant.id)
    setParams(next, { replace: true })
  }, [variant, params, setParams])

  // Restore from the URL on first load.
  useEffect(() => {
    if (!product || color || size) return
    const wanted = params.get('variant')
    const found = product.variants.find((v) => v.id === wanted)
    if (found) {
      setColor(found.options.Color)
      setSize(found.options.Size)
    }
  }, [product, params, color, size])

  // The gallery follows the picker when a store ships per-colour photography.
  useEffect(() => {
    if (!variant?.imageId || !product) return
    const i = product.images.findIndex((img) => img.id === variant.imageId)
    if (i >= 0) setShot(i)
  }, [variant, product])

  // A sticky buy bar once the real one scrolls away — on a long product page
  // the decision often happens next to the reviews, and walking back up to a
  // button is where a phone shopper leaves.
  useEffect(() => {
    const el = buyRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [product])

  if (loading) return <ProductSkeleton />
  if (error) {
    return (
      <div className="wrap py-24">
        {error.status === 404 ? (
          <Empty
            icon="search"
            title="We could not find that piece"
            body="It may have sold out and been retired."
            action={<Button to="/shop">Browse everything</Button>}
          />
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )}
      </div>
    )
  }

  const saved = has(product.slug)
  const lowStock = variant && variant.inventory > 0 && variant.inventory <= 3

  return (
    <>
      <div className="wrap pt-8">
        <Breadcrumbs
          trail={[
            { label: 'Home', to: '/' },
            { label: 'Shop', to: '/shop' },
            { label: product.categories[0], to: `/shop/${product.categories[0]}` },
            { label: product.title },
          ]}
        />
      </div>

      <div className="wrap mt-8 grid gap-10 pb-16 lg:grid-cols-2 lg:gap-16">
        {/* gallery */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="shot rounded-xs">
            <img
              src={product.images[shot]?.url}
              alt={product.images[shot]?.alt}
              width={product.images[shot]?.width}
              height={product.images[shot]?.height}
              fetchPriority="high"
              decoding="async"
            />
          </div>
          {product.images.length > 1 && (
            <div className="mt-3 flex gap-3">
              {product.images.map((img, i) => (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => setShot(i)}
                  aria-label={`View image ${i + 1}`}
                  aria-current={i === shot}
                  className={`shot w-20 rounded-xs ring-1 transition-shadow ${i === shot ? 'ring-ink' : 'ring-line hover:ring-muted'}`}
                >
                  <img src={img.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* buy box */}
        <div>
          {product.badges?.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {product.badges.map((b) => <Badge key={b} kind={b} />)}
            </div>
          )}

          <h1 className="text-display-lg">{product.title}</h1>
          <p className="mt-2 text-[15px] text-muted">{product.subtitle}</p>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Price
              price={variant?.price || product.price}
              compareAt={variant?.compareAtPrice ?? product.compareAtPrice}
              size="lg"
            />
            <a href="#reviews" className="shrink-0">
              <Rating value={product.rating.average} count={product.rating.count} />
            </a>
          </div>

          <p className="mt-6 text-[15px] leading-relaxed text-muted">{product.description}</p>

          {/* colour */}
          <fieldset className="mt-9">
            <legend className="text-[13px] font-medium">
              Colour: <span className="text-muted">{activeColor}</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {colors.map((c) => {
                const out = colorSoldOut[c]
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pickColor(c)}
                    aria-pressed={c === activeColor}
                    title={out ? `${c} — sold out` : c}
                    className={`relative grid h-11 w-11 place-items-center rounded-full ring-1 ring-inset transition-shadow ${
                      c === activeColor
                        ? 'ring-2 ring-offset-2 ring-ink ring-offset-page'
                        : 'ring-ink/15 hover:ring-muted'
                    } ${out ? 'opacity-45' : ''}`}
                    style={{ background: product.swatches?.[c] || '#ddd' }}
                  >
                    <span className="sr-only">{c}{out ? ' (sold out)' : ''}</span>
                    {out && <span aria-hidden="true" className="absolute h-[1.5px] w-8 -rotate-45 bg-ink/60" />}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* size */}
          <fieldset className="mt-7">
            <div className="flex items-baseline justify-between">
              <legend className="text-[13px] font-medium">Size</legend>
              {product.sizeChart ? (
                <button type="button" onClick={() => setChartOpen(true)} className="text-[12px] text-accent link-underline">
                  Size chart
                </button>
              ) : (
                <Link to="/pages/size-guide" className="text-[12px] text-muted link-underline">Size guide</Link>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sizes.map((s) => {
                const stock = sizeAvailability[s]
                const out = stock === 0
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={out}
                    onClick={() => setSize(s)}
                    aria-pressed={s === size}
                    className={`relative h-12 min-w-[3.5rem] rounded-xs border px-3.5 text-sm transition-colors ${
                      out
                        ? 'cursor-not-allowed border-line text-faint'
                        : s === size
                          ? 'border-ink bg-ink text-page'
                          : 'border-line text-ink hover:border-ink'
                    }`}
                  >
                    {s}
                    {out && (
                      <span aria-hidden="true" className="absolute inset-x-2 top-1/2 h-px -rotate-[18deg] bg-line" />
                    )}
                  </button>
                )
              })}
            </div>
            {size && lowStock && (
              <p className="mt-3 text-[13px] text-sale">Only {variant.inventory} left in {activeColor}, size {size}.</p>
            )}
          </fieldset>

          {/* add */}
          <div ref={buyRef} className="mt-8 flex flex-wrap items-center gap-3">
            <QuantityStepper value={qty} onChange={setQty} max={variant?.inventory || 10} />
            <Button
              size="lg"
              className="min-w-[12rem] flex-1"
              disabled={!variant || busy}
              onClick={() => add(variant.id, qty, `${product.title} added to your bag`)}
            >
              {!size ? 'Select a size' : !variant?.available ? 'Out of stock' : busy ? 'Adding…' : 'Add to bag'}
            </Button>
            {config.features?.wishlist !== false && (
            <Button
              variant="quiet"
              size="lg"
              aria-pressed={saved}
              aria-label={saved ? 'Remove from saved' : 'Save for later'}
              onClick={() => toggle(product.slug, product.title)}
              className="w-[52px] px-0"
            >
              <Icon name="heart" size={19} filled={saved} className={saved ? 'text-sale' : ''} />
            </Button>
            )}
          </div>

          <TrustRow />
          {config.trust?.showSocialProof !== false && <SocialProof product={product} />}

          {config.trust?.showFitFeedback !== false && (
            <FitBlock product={product} onOpenChart={() => setChartOpen(true)} />
          )}
          <FabricBlock product={product} />

          {/* details */}
          <div className="mt-10 border-t border-line">
            <div className="flex gap-6 border-b border-line" role="tablist">
              {[['details', 'Details'], ['care', 'Care'], ['shipping', 'Shipping']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`-mb-px border-b-2 py-3.5 text-[13px] transition-colors ${tab === id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="py-6">
              {tab === 'details' && (
                <ul className="space-y-2.5">
                  {product.details.map((d) => (
                    <li key={d} className="flex gap-2.5 text-[14px] leading-relaxed text-muted">
                      <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'care' && (
                <ul className="space-y-2.5">
                  {product.care.map((c) => (
                    <li key={c} className="flex gap-2.5 text-[14px] leading-relaxed text-muted">
                      <Icon name="sparkle" size={15} className="mt-0.5 shrink-0 text-accent" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'shipping' && (
                <div className="space-y-3 text-[14px] leading-relaxed text-muted">
                  <p>Standard shipping is $12, free over $150. Orders placed before 2pm ship the same working day.</p>
                  <p>Returns are free within 30 days, unworn and with tags attached. A prepaid label is in every parcel.</p>
                  <p>We repair anything we made. Send it back and we will quote before doing the work.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* reviews */}
      {config.features?.reviews !== false && (
      <section id="reviews" className="border-t border-line bg-surface">
        <div className="wrap grid gap-10 py-16 md:grid-cols-[18rem_1fr]">
          <div>
            <h2 className="text-display-md">Reviews</h2>
            {reviews.data && (
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
      {related.data?.items?.length > 0 && (
        <section className="wrap py-16">
          <h2 className="text-display-md">{recs.title || 'You might also like'}</h2>
          <div className="mt-8">
            <ProductGrid products={related.data.items} />
          </div>
        </section>
      )}

      <Promises />
      <SizeChartModal product={product} open={chartOpen} onClose={() => setChartOpen(false)} />

      {/* Sticky buy bar. Appears only once the real one has scrolled away, so
          it never competes with itself, and it repeats the selection so the bar
          is never ambiguous about what it is about to add. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-page/95 backdrop-blur transition-transform duration-300 ${
          showSticky ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="wrap flex items-center gap-3 py-3">
          <div className="hidden w-12 shrink-0 sm:block">
            <div className="shot rounded-xs">
              <img src={product.images[shot]?.url} alt="" loading="lazy" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{product.title}</p>
            <p className="truncate text-[12px] text-faint">
              {activeColor}
              {size ? ` · ${size}` : ' · select a size'}
            </p>
          </div>
          <Price price={variant?.price || product.price} compareAt={variant?.compareAtPrice ?? product.compareAtPrice} size="sm" className="hidden shrink-0 sm:inline-flex" />
          <Button
            size="md"
            className="shrink-0"
            disabled={!variant || busy}
            onClick={() =>
              variant
                ? add(variant.id, qty, `${product.title} added to your bag`)
                : buyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          >
            {!size ? 'Choose size' : !variant?.available ? 'Out of stock' : 'Add to bag'}
          </Button>
        </div>
      </div>
    </>
  )
}

function ProductSkeleton() {
  return (
    <div className="wrap mt-12 grid gap-10 pb-20 lg:grid-cols-2 lg:gap-16">
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
