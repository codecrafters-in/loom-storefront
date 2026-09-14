import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import { useToast } from './ToastContext.jsx'
import { onExternalWrite, STORAGE_KEYS } from '../lib/crossTab.js'
import { addToCart as trackAdd, removeFromCart as trackRemove } from '../lib/analytics.js'
import { cartProblem } from '../lib/cart-lines.js'
import { isMock } from '../lib/config.js'

/**
 * Cart state.
 *
 * The cart is owned by the API, not by React — every mutation returns the
 * repriced cart and we replace state wholesale. That is deliberate: discounts,
 * shipping thresholds and tax are server concerns, and a client that recomputes
 * them locally will eventually disagree with the invoice.
 */
const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const { push } = useToast()

  useEffect(() => {
    let alive = true
    api
      .getCart()
      .then((c) => alive && setCart(c))
      .catch(() => alive && setCart(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Adding to the bag in another tab has to show up here, or the header count
  // and this one disagree until something happens to remount.
  useEffect(
    () =>
      onExternalWrite(STORAGE_KEYS.cart, () => {
        api.getCart().then(setCart).catch(() => {})
      }),
    [],
  )

  const run = useCallback(
    async (work, { successMessage, openDrawer } = {}) => {
      setBusy(true)
      try {
        const next = await work()
        setCart(next)
        if (successMessage) push(successMessage)
        if (openDrawer) setOpen(true)
        return next
      } catch (err) {
        push(cartProblem(err), { tone: 'error' })
        // A gateway page is open for this bag: fetch it again so the bag shows the way out.
        if (!isMock && err?.code === 'payment_in_progress') api.getCart().then(setCart).catch(() => {})
        throw err
      } finally {
        setBusy(false)
      }
    },
    [push],
  )

  const value = useMemo(
    () => ({
      cart,
      loading,
      busy,
      open,
      setOpen,
      // Three quarters of a kilo is one thing in the bag, not 0.75 of one.
      count: cart?.lines.reduce((a, l) => a + (Number.isInteger(l.quantity) ? l.quantity : 1), 0) || 0,
      /**
       * A variant id, as before, or a request from `useProductChoice` — the
       * product and its choices, extras, typed text, a combo's items and the
       * optional products added with it.
       */
      add: async (item, quantity = 1, label = 'Added to your bag') => {
        const request = typeof item === 'string' ? { variantId: item, quantity } : { ...item, quantity: item.quantity ?? quantity }
        const next = await run(() => api.addToCart(request), {
          successMessage: label,
          openDrawer: true,
        })
        // Reported from the resulting cart, which is the only thing that knows
        // what was actually added — the variant, the price and the quantity.
        const line = [...(next?.lines || [])].reverse().find((l) =>
          request.variantId ? l.variantId === request.variantId : l.productSlug === request.productSlug && !l.linkedTo,
        )
        trackAdd(line, request.quantity)
        return next
      },
      update: (lineId, quantity) => run(() => api.updateCartLine(lineId, quantity)),
      remove: (lineId) => {
        // Captured before the call, because after it the line is gone.
        const line = cart?.lines?.find((l) => l.id === lineId)
        return run(() => api.removeCartLine(lineId), { successMessage: 'Removed' }).then((next) => {
          trackRemove(line)
          return next
        })
      },
      applyDiscount: (code) => run(() => api.applyDiscount(code), { successMessage: 'Code applied' }),
      clear: () => run(() => api.clearCart()),
      cancelPayment: () => run(() => api.cancelCartPayment(), { successMessage: 'Payment cancelled. You can change your bag now.' }),
      refresh: () => api.getCart().then(setCart),
    }),
    [cart, loading, busy, open, run],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>.')
  return ctx
}
