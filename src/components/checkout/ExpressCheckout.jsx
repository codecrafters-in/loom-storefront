import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api/index.js'
import { useCart } from '../../store/CartContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { returnUrls } from '../../lib/payments/index.js'
import { mountExpressCheckout } from '../../lib/payments/express.js'
import { purchase } from '../../lib/analytics.js'

const STILL_WAITING =
  'We have not heard back from the payment provider yet. If the payment went through, we will email you. There is no need to pay again.'

/**
 * Apple Pay and Google Pay buttons for the bag. Shows nothing unless the store has a wallet for it (Stripe with
 * Express Checkout) and this browser has one set up, so a shopper never sees a button that cannot work.
 */
export default function ExpressCheckout({ className = '' }) {
  const { cart, refresh } = useCart()
  const config = useStorefront()
  const navigate = useNavigate()
  const box = useRef(null)
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState(null)
  const subtotal = cart?.subtotal?.amount

  useEffect(() => {
    if (!cart?.id || !cart.lines?.length) return undefined
    let alive = true
    let handle = null
    ;(async () => {
      try {
        const express = await api.getExpressOptions(cart.id)
        if (!alive || !express?.methods?.length) return
        handle = await mountExpressCheckout({
          container: box.current,
          express,
          cart,
          api,
          urls: returnUrls(config.checkout, window.location.origin),
          onAvailable: (ok) => alive && setAvailable(ok),
          onError: (err) => alive && setMessage(err?.message || 'The payment did not go through.'),
          onDone: async (payment) => {
            await refresh().catch(() => {})
            if (!payment?.order) {
              if (alive) setMessage(STILL_WAITING)
              return
            }
            const order = await api.getOrder(payment.order.id).catch(() => null)
            if (order) purchase(order)
            navigate(`/order/${payment.order.id}`, order ? { state: { order } } : undefined)
          },
        })
        if (!alive) handle?.destroy()
      } catch {
        // No wallet buttons; checkout still works.
      }
    })()
    return () => {
      alive = false
      handle?.destroy()
    }
  }, [cart?.id, subtotal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={className}>
      {available && (
        <p className="mb-2.5 text-center text-[11px] uppercase tracking-[0.12em] text-faint">Express checkout</p>
      )}
      <div ref={box} />
      {message && <p role="alert" className="mt-2 text-[13px] text-sale">{message}</p>}
    </div>
  )
}
