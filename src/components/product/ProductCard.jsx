import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Icon, Price } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { optionsOf } from '../../lib/variants.js'
import { useWishlist } from '../../store/WishlistContext.jsx'
import { t } from '../../i18n/index.js'
import api from '../../lib/api/index.js'
import { selectItem } from '../../lib/analytics.js'

// Downloaded the first time somebody asks for a quick look, not with the grid.
const QuickView = lazy(() => import('./QuickView.jsx'))

/**
 * A catalogue card.
 *
 * The second shot swaps in on hover, which is the one interaction shoppers
 * actually use on a grid — and it is the reason every product carries two
 * images in the contract rather than one.
 *
 * It also renders a `ProductSummary` (the accessory and alternative rails),
 * which has one `image` and no variants.
 */
export default function ProductCard({ product, priority = false, className = '' }) {
  /**
   * A card shows a range when its variants disagree.
   *
   * A single price on a product whose black colourway costs thirty dollars more
   * is a number the shopper finds out is wrong on the next page, which is the
   * worst place to find it out. See the same calculation in lib/variants.js.
   */
  const span = useMemo(() => {
    const prices = (product.variants || []).map((v) => v.price).filter(Boolean)
    if (!prices.length) return { price: product.price, compareAt: product.compareAtPrice }
    const low = prices.reduce((a, b) => (b.amount < a.amount ? b : a))
    const high = prices.reduce((a, b) => (b.amount > a.amount ? b : a))
    return low.amount === high.amount
      ? { price: low, compareAt: product.compareAtPrice }
      : { price: low, to: high }
  }, [product])

  // The colour option by role, whatever it is called, and its swatches.
  const swatches = useMemo(() => optionsOf(product).find((o) => o.role === 'color')?.choices || [], [product])
  const [quick, setQuick] = useState(false)

  const { has, toggle } = useWishlist()
  const saved = has(product.slug)
  const images = product.images?.length ? product.images : product.image ? [product.image] : []
  const badge = product.badges?.find((b) => ['sold-out', 'sale', 'new', 'bestseller'].includes(b))
  const soldOut = product.badges?.includes('sold-out') || product.available === false

  return (
    <article className={`group relative ${className}`}>
      <div className="relative">
        <Link
          to={`/product/${product.slug}`}
          className="block"
          onClick={() => selectItem(product)}
          // Starts loading the product while the pointer is on its way: the page opens with it already there.
          onMouseEnter={() => api.getProduct(product.slug).catch(() => {})}
        >
          <div className="shot relative rounded-xs">
            <Media
              sizes={SIZES.card}
              src={images[0]?.url}
              srcset={images[0]?.srcset}
              type={images[0]?.type}
              provider={images[0]?.provider}
              alt={images[0]?.alt || product.title}
              loading={priority ? 'eager' : 'lazy'}
              fetchpriority={priority ? 'high' : 'auto'}
              decoding="async"
              width={images[0]?.width}
              height={images[0]?.height}
              className="h-full w-full object-cover transition-opacity duration-500 group-hover:opacity-0"
            />
            {images[1] && (
              <Media
                src={images[1].url}
                type={images[1].type}
                provider={images[1].provider}
                alt=""
                loading="lazy"
                decoding="async"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-[1.02] object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
            )}
            {badge && <Badge kind={badge} className="absolute start-3 top-3" />}
            {soldOut && (
              <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-page">
                {t('Sold out')}
              </span>
            )}
          </div>
        </Link>

        <button
          type="button"
          onClick={() => toggle(product.slug, product.title)}
          aria-pressed={saved}
          aria-label={saved ? t('Remove {title} from saved', { title: product.title }) : t('Save {title}', { title: product.title })}
          className="absolute end-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-surface/85 text-ink backdrop-blur transition-colors hover:bg-surface"
        >
          <Icon name="heart" size={16} filled={saved} className={saved ? 'text-sale' : ''} />
        </button>

        {/* On hover or focus, over the photograph: the look is the question. Not
            on a phone, where there is no hover and the page is one tap away. */}
        <button
          type="button"
          onClick={() => setQuick(true)}
          aria-label={t('Quick view: {title}', { title: product.title })}
          className="absolute inset-x-2.5 bottom-2.5 hidden h-9 items-center justify-center rounded-xs bg-page/90 text-[12px] font-medium text-ink opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
        >
          {t('Quick view')}
        </button>
      </div>

      {/*
        Title, then subtitle, then price — stacked, not title-left/price-right.
        The two-column row falls apart in a two-up mobile grid: a struck-through
        original with a discount chip leaves the title forty pixels.
      */}
      <div className="pt-4">
        {product.brand && (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{product.brand.name}</p>
        )}
        <h3 className="font-sans text-[15px] font-medium leading-snug">
          <Link to={`/product/${product.slug}`} className="link-underline decoration-transparent">
            {product.title}
          </Link>
        </h3>
        {product.subtitle && <p className="mt-1 text-[13px] text-faint">{product.subtitle}</p>}
        <Price price={span.price} to={span.to} compareAt={span.compareAt} size="sm" className="mt-2 flex-wrap" />

        {/* One fit signal in the grid. Someone comparing eight products decides
            which two to open here, and "runs small" is the fact that decides it. */}
        {product.fit?.verdict && product.fit.verdict !== 'true-to-size' && (
          <p className="mt-1.5 text-[12px] text-sale">
            {product.fit.verdict === 'runs-small' ? t('Runs small') : t('Runs large')}
          </p>
        )}

        {swatches.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {swatches.slice(0, 5).map((c) => (
              <span
                key={c.id}
                title={c.name}
                className="h-3 w-3 rounded-full ring-1 ring-inset ring-ink/15"
                style={{ background: c.color || '#ddd' }}
              />
            ))}
            {swatches.length > 5 && <span className="text-[11px] text-faint">+{swatches.length - 5}</span>}
          </div>
        )}
      </div>

      {quick && (
        <Suspense fallback={null}>
          <QuickView slug={product.slug} onClose={() => setQuick(false)} />
        </Suspense>
      )}
    </article>
  )
}
