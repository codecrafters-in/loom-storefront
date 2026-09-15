import { useState } from 'react'
import api from '../../lib/api/index.js'
import { Button, Icon } from '../ui/index.jsx'
import { useCart } from '../../store/CartContext.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { t } from '../../i18n/index.js'

const signature = (c) => JSON.stringify([c?.codes, c?.discount?.amount, c?.lines?.length, c?.claimableRewards?.length])

/**
 * A discount code box and the codes already on the bag, for a summary column.
 *
 * Checkout needs it as much as the bag page: most shoppers go from the bag drawer straight to checkout, and a code
 * they were given has nowhere to go if the box is only on the full bag page. `onChange` runs once the bag changed, so
 * the page can redo what depends on the total (checkout prepares the payment again).
 */
export default function DiscountCode({ className = '', disabled = false, onChange }) {
  const { cart, refresh } = useCart()
  const { push } = useToast()
  const [code, setCode] = useState('')
  const [working, setWorking] = useState(false)
  const applied = cart?.codes?.length ? cart.codes : cart?.discountCode ? [cart.discountCode] : []

  const act = async (work, said) => {
    setWorking(true)
    try {
      const next = await work()
      await refresh()
      const message = typeof said === 'function' ? said(next) : said
      if (message) push(message)
      onChange?.(next)
      return next
    } catch (err) {
      push(err.message, { tone: 'error' })
      return null
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className={className}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const entered = code.trim()
          if (!entered) return
          const before = signature(cart)
          const next = await act(
            () => api.addCode(entered),
            (after) => (signature(after) === before ? t('That code didn’t change your bag.') : t('Code applied')),
          )
          if (next) setCode('')
        }}
        className="flex gap-2"
      >
        <label className="sr-only" htmlFor="checkout-discount">{t('Discount code')}</label>
        <input
          id="checkout-discount"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('Discount code')}
          autoComplete="off"
          className="field h-10 text-[13px]"
        />
        <Button as="button" type="submit" variant="quiet" size="sm" disabled={disabled || working} className="h-10 shrink-0">
          {t('Apply')}
        </Button>
      </form>
      {applied.map((c) => (
        <p key={c.code} className="mt-2 flex items-center gap-1.5 text-[12px] text-good">
          <Icon name="check" size={13} />
          <span className="min-w-0 flex-1">{c.code} — {c.label}</span>
          <button
            type="button"
            className="text-faint link-underline hover:text-sale"
            disabled={disabled || working}
            onClick={() => act(() => api.removeCode(c.code), t('Code removed'))}
          >
            {t('Remove')}
          </button>
        </p>
      ))}
    </div>
  )
}
