import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import { useToast } from './ToastContext.jsx'

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
        push(err.message || 'Something went wrong.', { tone: 'error' })
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
      count: cart?.lines.reduce((a, l) => a + l.quantity, 0) || 0,
      add: (variantId, quantity = 1, label = 'Added to your bag') =>
        run(() => api.addToCart({ variantId, quantity }), { successMessage: label, openDrawer: true }),
      update: (lineId, quantity) => run(() => api.updateCartLine(lineId, quantity)),
      remove: (lineId) => run(() => api.removeCartLine(lineId), { successMessage: 'Removed' }),
      applyDiscount: (code) => run(() => api.applyDiscount(code), { successMessage: 'Code applied' }),
      clear: () => run(() => api.clearCart()),
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
