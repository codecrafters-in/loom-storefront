import { Suspense, lazy, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../store/CartContext.jsx'
import { Button, Icon, QuantityStepper, Empty } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { formatMoney, taxNote } from '../../lib/money.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { nestLines } from '../../lib/cart-lines.js'
import { stepperProps } from '../../lib/quantity.js'
import LineDetails from './LineDetails.jsx'
import PaymentLock from './PaymentLock.jsx'
import useFocusTrap from '../../hooks/useFocusTrap.js'
import { isMock } from '../../lib/config.js'
import { t } from '../../i18n/index.js'

// The same rows as the bag page, loaded once the bag has something in it rather than with every page.
const DrawerTotals = lazy(() => import('./TotalRows.jsx').then((m) => ({ default: m.DrawerTotals })))
// What goes with the bag, only once the drawer is opened: it costs every other page nothing.
const DrawerSuggestions = lazy(() => import('./DrawerSuggestions.jsx'))

/** Slides in after every add. Nothing here is decorative — it is the fastest
 *  path from "added" to "checkout", which is the only job of a cart drawer. */
export default function CartDrawer() {
  const { cart, open, setOpen, update, remove, busy } = useCart()
  const config = useStorefront()
  const rec = config.recommendations?.inCart || {}
  const trapRef = useFocusTrap(open)

  // Keyed on the last line added, so the suggestions follow what the shopper is actually buying.
  const anchor = cart?.lines?.at(-1)?.productSlug
  // The suggestions rail loads the first time the drawer opens and stays, so closing it does not empty the rail
  // while it slides away.
  const [seen, setSeen] = useState(false)
  if (open && !seen) setSeen(true)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, setOpen])

  const lines = cart?.lines || []
  const remaining = cart?.freeShippingRemaining?.amount ?? 0

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-scrim/35 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        ref={trapRef}
        tabIndex={-1}
        // Closed, it is off screen but still in the page: `inert` keeps it out of the Tab order.
        {...(open ? {} : { inert: '' })}
        role="dialog"
        aria-modal="true"
        aria-label={t('Your bag')}
        className={`fixed end-0 top-0 z-50 flex h-[100dvh] w-[min(92vw,26rem)] flex-col bg-page shadow-panel transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'}`}
      >
        {/*
          Everything in this drawer competes with the one thing it is for:
          seeing what is in the bag. On a phone the header, the suggestion rail
          and the totals came to roughly 500px of fixed chrome, which left about
          one line item visible on a 667px screen — a two-item bag where the
          second item is a rumour. Every block below is tightened for that
          reason, and the list gets what they give back.
        */}
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[17px]">
            {t('Your bag')}{lines.length > 0 && <span className="ms-2 text-sm text-faint">({lines.length})</span>}
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label={t('Close bag')} className="text-muted transition-colors hover:text-ink">
            <Icon name="close" size={20} />
          </button>
        </header>

        {lines.length === 0 ? (
          <Empty
            icon="bag"
            title={t('Nothing here yet')}
            body={t('Saved items and anything you add will show up here.')}
            action={<Button to="/shop" onClick={() => setOpen(false)}>{t('Start shopping')}</Button>}
          />
        ) : (
          <>
            {remaining > 0 && (
              <p className="border-b border-line bg-accent-soft/60 px-5 py-2.5 text-[12px] text-accent">
                {t('{amount} away from free shipping', { amount: formatMoney(cart.freeShippingRemaining) })}
              </p>
            )}

            {/* The demo never opens a gateway page, so its build leaves this out. */}
            {!isMock && <PaymentLock className="mx-5 mt-3" />}
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {nestLines(lines).map(({ line, depth }) => (
                <li key={line.id} className={`flex gap-3.5 py-4 ${depth ? 'ps-6' : ''}`}>
                  <Link to={`/product/${line.productSlug}`} onClick={() => setOpen(false)} className="w-16 shrink-0">
                    <div className="shot rounded-xs">
                      <Media sizes={SIZES.thumb} src={line.image?.url} type={line.image?.type} alt={line.image?.alt || line.title} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <Link to={`/product/${line.productSlug}`} onClick={() => setOpen(false)} className="text-sm font-medium leading-snug">
                        {line.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(line.id)}
                        aria-label={t('Remove {title}', { title: line.title })}
                        className="shrink-0 text-faint transition-colors hover:text-sale"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    <LineDetails line={line} />
                    <div className="mt-2.5 flex items-center justify-between">
                      {!isMock && line.isReward
                        ? <span className="text-[12px] text-good">{t('Free')}</span>
                        : <QuantityStepper size="sm" value={line.quantity} onChange={(q) => update(line.id, q)} disabled={busy} {...stepperProps(line.quantityRule)} />}
                      <span className="text-sm tabular-nums">
                        {line.compareAtTotal && <del className="me-1.5 text-faint">{formatMoney(line.compareAtTotal)}</del>}
                        {formatMoney(line.lineTotal)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {seen && rec.enabled !== false && anchor && (
              <Suspense fallback={null}>
                <DrawerSuggestions open={open} anchor={anchor} rec={rec} close={() => setOpen(false)} />
              </Suspense>
            )}

            <footer className="border-t border-line px-5 py-4">
              {/* The rows, the store's tax note and the total, as on the bag page: the drawer is where most shoppers read the total. */}
              <Suspense fallback={null}>
                <DrawerTotals bag={cart} note={taxNote(config.pricing)} />
              </Suspense>
              <Button to="/checkout" full size="lg" className="mt-3.5" onClick={() => setOpen(false)}>
                {t('Checkout')}
              </Button>
              <Link
                to="/cart"
                onClick={() => setOpen(false)}
                className="link-underline mt-2.5 block text-center text-[12px] text-muted"
              >
                {t('View full bag')}
              </Link>
            </footer>
          </>
        )}
      </aside>
    </>
  )
}
