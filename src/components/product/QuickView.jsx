import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import useProductChoice from '../../hooks/useProductChoice.js'
import { useCart } from '../../store/CartContext.jsx'
import { Button, ErrorState, Icon, Price, QuantityStepper, Skeleton } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { ExtraOptions, OptionPicker } from './VariantPicker.jsx'
import { CompareToggle } from './CompareTray.jsx'
import useFocusTrap from '../../hooks/useFocusTrap.js'
import { t } from '../../i18n/index.js'

const OptionalOffer = lazy(() => import('./OptionalOffer.jsx'))

/**
 * A look at a product without leaving the grid.
 *
 * The same picker and the same `useProductChoice` as the product page, so a
 * choice that is struck through there is struck through here. A set is the one
 * thing it sends to the full page: choosing one item from each group inside a
 * dialog over a grid is where a purchase gets lost. The store's optional
 * products are offered here too, as on the product page, so they are added
 * with the product and linked to its line.
 *
 * Its own chunk, loaded on the first press of Quick view.
 */
export default function QuickView({ slug, onClose }) {
  const { data: product, error, loading, reload } = useAsync(() => api.getProduct(slug), [slug])
  const trapRef = useFocusTrap(true)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      ref={trapRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={product ? t('Quick view: {title}', { title: product.title }) : t('Quick view')}
    >
      <button type="button" aria-label={t('Close')} onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xs border border-line bg-page text-start shadow-panel">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close quick view')}
          className="absolute end-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-page/85 text-muted transition-colors hover:text-ink"
        >
          <Icon name="close" size={18} />
        </button>
        {loading ? (
          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <Skeleton className="aspect-[4/5] w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : error ? (
          <div className="p-8">
            <ErrorState error={error} onRetry={reload} />
          </div>
        ) : (
          product && <Body product={product} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

function Body({ product, onClose }) {
  const choice = useProductChoice(product)
  const { add, busy } = useCart()
  const image = choice.gallery.find((i) => i.type !== 'video') || product.images[0]

  const [offer, setOffer] = useState(null)

  const submit = (request) =>
    add(request, request.quantity ?? choice.qty, t('{title} added to your bag', { title: product.title }))
      .then(onClose)
      .catch(() => {
        /* the bag has already said why */
      })

  const buy = () => {
    const request = choice.request()
    if (product.optionalProducts?.length) setOffer(request)
    else submit(request)
  }

  return (
    <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
      <div className="shot overflow-hidden rounded-xs bg-sunken">
        <Media src={image?.url} alt={image?.alt || product.title} sizes={SIZES.card} className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        {product.brand && <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{product.brand.name}</p>}
        <h2 className="mt-1 pe-8 text-display-md">{product.title}</h2>
        {product.subtitle && <p className="mt-1.5 text-[14px] text-muted">{product.subtitle}</p>}
        <Price price={choice.shown.price} to={choice.shown.to} compareAt={choice.shown.compareAt} className="mt-4" />

        {product.type === 'combo' ? (
          <p className="mt-6 text-[14px] leading-relaxed text-muted">{t('Choose what goes in the set on its page.')}</p>
        ) : (
          <>
            <OptionPicker choice={choice} />
            <ExtraOptions choice={choice} />
            <div className="mt-6 flex items-center gap-3">
              <QuantityStepper value={choice.qty} onChange={choice.setQty} {...choice.stepper} />
              <Button className="flex-1" disabled={!choice.ready || busy} onClick={buy}>
                {choice.blocker || (busy ? t('Adding…') : t('Add to bag'))}
              </Button>
            </div>
          </>
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <Link to={`/product/${product.slug}`} onClick={onClose} className="link-underline text-[13px] text-accent">
            {t('View full details')}
          </Link>
          <CompareToggle slug={product.slug} />
        </div>
      </div>

      {offer && (
        <Suspense fallback={null}>
          <OptionalOffer
            product={product}
            busy={busy}
            onClose={() => setOffer(null)}
            onConfirm={(optionalProducts) => {
              setOffer(null)
              submit(optionalProducts.length ? { ...offer, optionalProducts } : offer)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
