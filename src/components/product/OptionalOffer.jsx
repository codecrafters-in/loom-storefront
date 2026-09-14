import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Icon } from '../ui/index.jsx'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { formatMoney } from '../../lib/money.js'
import useFocusTrap from '../../hooks/useFocusTrap.js'

/**
 * "Anything to go with it?" — the store's optional products, offered as the
 * line is added.
 *
 * Before the add, not after it, because they are added *with* it: one request,
 * linked to the line, so the bag shows the case under the phone it was chosen
 * for and removing the phone takes the case too. Offering them after would be
 * a second add and an unlinked line.
 *
 * A summary with a `variantId` is one variant and can be ticked. One without
 * has options to choose, and a dialog over a product page is no place to choose
 * them, so it links to its own page instead. "No thanks" adds the product alone
 * — the dialog must never be the thing that stops a purchase.
 *
 * Its own chunk, loaded on the first press of the button that needs it.
 */
export default function OptionalOffer({ product, busy, onConfirm, onClose }) {
  const [picked, setPicked] = useState([])
  const trapRef = useFocusTrap(true)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const offers = (product.optionalProducts || []).filter((p) => p.available !== false)
  const chosen = picked.map((variantId) => ({ variantId, quantity: 1 }))
  const tick = (variantId, on) => setPicked((list) => (on ? [...list, variantId] : list.filter((id) => id !== variantId)))

  return (
    <div ref={trapRef} tabIndex={-1} className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="optional-offer-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-md rounded-xs border border-line bg-page p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="optional-offer-title" className="font-display text-xl">Anything to go with it?</h2>
            <p className="mt-1 text-[13px] text-muted">Added to your bag together with {product.title}.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
            <Icon name="close" size={18} />
          </button>
        </div>

        <ul className="mt-5 space-y-2.5">
          {offers.map((p) => (
            <li key={p.slug} className="flex items-center gap-3 rounded-xs border border-line p-2.5">
              <span className="w-12 shrink-0">
                <span className="shot block overflow-hidden rounded-xs">
                  <Media src={p.image?.url} alt="" sizes={SIZES.thumb} className="h-full w-full object-cover" />
                </span>
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-snug">
                {p.variantId ? (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.variantId)}
                      onChange={(e) => tick(p.variantId, e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    {p.title}
                  </label>
                ) : (
                  <>
                    <span className="block">{p.title}</span>
                    <Link to={`/product/${p.slug}`} onClick={onClose} className="link-underline text-[12px] text-accent">
                      Choose options
                    </Link>
                  </>
                )}
              </span>
              <span className="shrink-0 text-[13px] tabular-nums">{formatMoney(p.price)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button full disabled={busy} onClick={() => onConfirm(chosen)}>
            {chosen.length ? `Add ${chosen.length + 1} items` : 'Add to bag'}
          </Button>
          <Button full variant="quiet" disabled={busy} onClick={() => onConfirm([])}>
            No thanks
          </Button>
        </div>
      </div>
    </div>
  )
}
