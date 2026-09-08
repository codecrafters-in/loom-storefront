import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../store/CartContext.jsx'
import { Button, Icon, QuantityStepper, Empty } from '../ui/index.jsx'
import { formatMoney } from '../../lib/money.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'

/** Slides in after every add. Nothing here is decorative — it is the fastest
 *  path from "added" to "checkout", which is the only job of a cart drawer. */
export default function CartDrawer() {
  const { cart, open, setOpen, update, remove, busy } = useCart()
  const config = useStorefront()
  const rec = config.recommendations?.inCart || {}

  // Keyed on the last line added, so the suggestions follow what the shopper is
  // actually buying. Skipped entirely when the bag is empty or the feature is
  // off, so an empty drawer costs no request.
  const anchor = cart?.lines?.at(-1)?.productSlug
  const suggestions = useAsync(
    () => api.getRelated(anchor, { limit: rec.limit || 3, strategy: rec.strategy || 'same-category' }),
    [anchor, rec.limit, rec.strategy],
    { skip: !open || !anchor || rec.enabled === false },
  )

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
        className={`fixed inset-0 z-40 bg-ink/35 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className={`fixed right-0 top-0 z-50 flex h-[100dvh] w-[min(92vw,26rem)] flex-col bg-page shadow-panel transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg">
            Your bag{lines.length > 0 && <span className="ml-2 text-sm text-faint">({lines.length})</span>}
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close bag" className="text-muted transition-colors hover:text-ink">
            <Icon name="close" size={20} />
          </button>
        </header>

        {lines.length === 0 ? (
          <Empty
            icon="bag"
            title="Nothing here yet"
            body="Saved items and anything you add will show up here."
            action={<Button to="/shop" onClick={() => setOpen(false)}>Start shopping</Button>}
          />
        ) : (
          <>
            {remaining > 0 && (
              <p className="border-b border-line bg-accent-soft/60 px-5 py-3 text-[13px] text-accent">
                {formatMoney(cart.freeShippingRemaining)} away from free shipping
              </p>
            )}

            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-4 py-5">
                  <Link to={`/product/${line.productSlug}`} onClick={() => setOpen(false)} className="w-20 shrink-0">
                    <div className="shot rounded-xs">
                      <img src={line.image?.url} alt={line.image?.alt || line.title} loading="lazy" />
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
                        aria-label={`Remove ${line.title}`}
                        className="shrink-0 text-faint transition-colors hover:text-sale"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    <p className="mt-1 text-[12px] text-faint">
                      {Object.entries(line.options).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <QuantityStepper size="sm" value={line.quantity} onChange={(q) => update(line.id, q)} disabled={busy} />
                      <span className="text-sm tabular-nums">{formatMoney(line.lineTotal)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {rec.enabled !== false && suggestions.data?.items?.length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <p className="eyebrow">{rec.title || 'Goes with this'}</p>
                <ul className="mt-3 flex gap-3 overflow-x-auto no-scrollbar">
                  {suggestions.data.items.map((p) => (
                    <li key={p.slug} className="w-24 shrink-0">
                      <Link to={`/product/${p.slug}`} onClick={() => setOpen(false)}>
                        <div className="shot rounded-xs">
                          <img src={p.images[0]?.url} alt={p.images[0]?.alt || p.title} loading="lazy" />
                        </div>
                        <p className="mt-1.5 truncate text-[11px] leading-snug">{p.title}</p>
                        <p className="text-[11px] text-faint">{formatMoney(p.price)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <footer className="border-t border-line px-5 py-5">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(cart.subtotal)}</dd>
                </div>
                {cart.discount?.amount > 0 && (
                  <div className="flex justify-between text-sale">
                    <dt>{cart.discountCode?.label || 'Discount'}</dt>
                    <dd className="tabular-nums">−{formatMoney(cart.discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted">Shipping</dt>
                  <dd className="tabular-nums">{cart.shipping.amount === 0 ? 'Free' : formatMoney(cart.shipping)}</dd>
                </div>
              </dl>
              <p className="mt-3 flex justify-between border-t border-line pt-3 text-base">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(cart.total)}</span>
              </p>
              <Button to="/checkout" full size="lg" className="mt-4" onClick={() => setOpen(false)}>
                Checkout
              </Button>
              <Link
                to="/cart"
                onClick={() => setOpen(false)}
                className="mt-3 block text-center text-[13px] text-muted link-underline"
              >
                View full bag
              </Link>
            </footer>
          </>
        )}
      </aside>
    </>
  )
}
