import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../lib/api/index.js'

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

  const value = useMemo(
    () => ({
      customer,
      loading,
      signedIn: !!customer,
      login: async (body) => {
        const res = await api.login(body)
        setCustomer(res.customer)
        return res
      },
      register: async (body) => {
        const res = await api.register(body)
        setCustomer(res.customer)
        return res
      },
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
