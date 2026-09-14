import { useEffect } from 'react'
import { Button, Icon, Price } from '../ui/index.jsx'
import { t } from '../../i18n/index.js'
import { OptionPicker } from './VariantPicker.jsx'
import useFocusTrap from '../../hooks/useFocusTrap.js'

/**
 * The picker, over the page, reachable from the sticky bar.
 *
 * The problem it solves is specific to phones: the buy box is one column, so by
 * the time a shopper has read the detail the options are most of a screen
 * above them. Comparing two colourways meant scrolling up, tapping, scrolling
 * back down — twice — and the second comparison is the one nobody makes.
 *
 * A sheet rather than a modal because it is anchored to the bar that opened it,
 * and it stops short of full height so the photograph stays visible behind it —
 * which is the whole point when the thing being changed is the colour.
 *
 * Its own chunk: it only exists after a tap, and the product page is already
 * the heaviest first paint in the theme.
 */
export default function VariantSheet({ product, choice, busy, aside, onClose, onAdd }) {
  const trapRef = useFocusTrap(true)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div ref={trapRef} tabIndex={-1} className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={t('Choose options for {title}', { title: product.title })}>
      <button type="button" aria-label={t('Close')} onClick={onClose} className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />

      <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-lg border-t border-line bg-page">
        {/* A grab handle is the only affordance that says "this came from the
            bottom and goes back there" without any words. */}
        <div className="sticky top-0 z-10 flex justify-center bg-page pb-1 pt-2.5">
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line" />
        </div>

        <div className="px-5 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{product.title}</p>
              <Price price={choice.shown.price} to={choice.shown.to} compareAt={choice.shown.compareAt} size="sm" className="mt-1 flex-wrap" />
            </div>
            <Button variant="quiet" size="sm" square aria-label={t('Close')} onClick={onClose}>
              <Icon name="close" size={16} />
            </Button>
          </div>

          <OptionPicker choice={choice} aside={aside} />

          <Button size="lg" full className="mt-6" disabled={!choice.ready || busy} onClick={onAdd}>
            {choice.blocker || (busy ? t('Adding…') : t('Add to bag'))}
          </Button>
        </div>
      </div>
    </div>
  )
}
