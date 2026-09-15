import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'
import { onExternalWrite, STORAGE_KEYS } from '../lib/crossTab.js'
import { adopt } from '../lib/recentlyViewed.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api
      .getMe()
      .then((c) => alive && setCustomer(c))
      .catch(() => {
        /* 401 is the normal state for a visitor, not an error worth showing */
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  /**
   * Signing out in one tab signs out the others.
   *
   * The alternative is a tab that still shows an account menu, an order history
   * and a saved address for somebody who has left — which on a shared computer
   * is the disclosure the order scoping was fixed to prevent, arriving through
   * a different door.
   */
  useEffect(
    () =>
      onExternalWrite(STORAGE_KEYS.session, () => {
        api
          .getMe()
          .then(setCustomer)
          .catch(() => setCustomer(null))
      }),
    [],
  )

  const signIn = (call) => async (body) => {
    const res = await call(body)
    adopt(res.customer?.id)
    setCustomer(res.customer)
    return res
  }

  const value = useMemo(
    () => ({
      customer,
      loading,
      signedIn: !!customer,
      // Every way of signing in: the account's customer, and what was browsed as a guest kept for it. Somebody who
      // browsed for ten minutes and then signed in to check out should not lose the ten minutes.
      login: signIn(api.login),
      register: signIn(api.register),
      /** A password from a reset or invitation link. */
      resetPassword: signIn(api.resetPassword),
      signupWithToken: signIn(api.signupWithToken),
      /** A code sent by text message. */
      verifyLoginCode: signIn(api.verifyLoginCode),
      /** A provider from Odoo's OAuth app. */
      finishOAuth: signIn(api.finishOAuth),
      /** The new sign-in email was confirmed from its link. */
      emailChanged: (email) => setCustomer((current) => (current ? { ...current, email, emailVerified: true } : current)),
      /** The account is closed: signed out here. */
      deleteAccount: async (body) => {
        await api.deleteAccount(body)
        setCustomer(null)
      },
      /** The address was confirmed (maybe in another tab): the account now knows. */
      markVerified: () => setCustomer((current) => (current ? { ...current, emailVerified: true } : current)),
      logout: async () => {
        await api.logout()
        setCustomer(null)
      },
      update: async (patch) => {
        const next = await api.updateMe(patch)
        setCustomer(next)
        return next
      },
      saveAddress: async (address) => {
        const next = await api.saveAddress(address)
        setCustomer(next)
        return next
      },
      deleteAddress: async (addressId) => {
        const next = await api.deleteAddress(addressId)
        setCustomer(next)
        return next
      },
    }),
    [customer, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.')
  return ctx
}
