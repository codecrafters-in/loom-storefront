import { Link } from 'react-router-dom'
import { Badge, Icon, Price } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { useWishlist } from '../../store/WishlistContext.jsx'

/**
 * A catalogue card.
 *
 * The second shot swaps in on hover, which is the one interaction shoppers
 * actually use on a grid — and it is the reason every product carries two
 * images in the contract rather than one.
 */
export default function ProductCard({ product, priority = false, className = '' }) {
  const { has, toggle } = useWishlist()
  const saved = has(product.slug)
  const badge = product.badges?.find((b) => ['sold-out', 'sale', 'new', 'bestseller'].includes(b))
  const soldOut = product.badges?.includes('sold-out')
  const colors = product.options?.find((o) => o.name === 'Color')?.values || []

  return (
    <article className={`group relative ${className}`}>
      <Link to={`/product/${product.slug}`} className="block">
        <div className="shot relative rounded-xs">
          <Media
            src={product.images[0]?.url}
            type={product.images[0]?.type}
            alt={product.images[0]?.alt || product.title}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            width={product.images[0]?.width}
            height={product.images[0]?.height}
            className="h-full w-full object-cover transition-opacity duration-500 group-hover:opacity-0"
          />
          {product.images[1] && (
            <Media
              src={product.images[1].url}
              type={product.images[1].type}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-[1.02] object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          )}
          {badge && <Badge kind={badge} className="absolute left-3 top-3" />}
          {soldOut && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-page">
              Sold out
            </span>
          )}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggle(product.slug, product.title)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.title} from saved` : `Save ${product.title}`}
        className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-surface/85 text-ink backdrop-blur transition-colors hover:bg-surface"
      >
        <Icon name="heart" size={16} filled={saved} className={saved ? 'text-sale' : ''} />
      </button>

      <div className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-sans text-[15px] font-medium leading-snug">
            <Link to={`/product/${product.slug}`} className="link-underline decoration-transparent">
              {product.title}
            </Link>
          </h3>
          <Price price={product.price} compareAt={product.compareAtPrice} size="sm" className="shrink-0" />
        </div>
        <p className="mt-1 text-[13px] text-faint">{product.subtitle}</p>

        {/* One fit signal in the grid. Someone comparing eight products decides
            which two to open here, and "runs small" is the fact that decides it. */}
        {product.fit?.verdict && product.fit.verdict !== 'true-to-size' && (
          <p className="mt-1.5 text-[12px] text-sale">
            {product.fit.verdict === 'runs-small' ? 'Runs small' : 'Runs large'}
          </p>
        )}

        {colors.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {colors.slice(0, 5).map((name) => (
              <span
                key={name}
                title={name}
                className="h-3 w-3 rounded-full ring-1 ring-inset ring-ink/15"
                style={{ background: product.swatches?.[name] || '#ddd' }}
              />
            ))}
            {colors.length > 5 && <span className="text-[11px] text-faint">+{colors.length - 5}</span>}
          </div>
        )}
      </div>
    </article>
  )
}
