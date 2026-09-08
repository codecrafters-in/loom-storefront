import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { config, isMock } from '../lib/config.js'

/**
 * Admin session, kept deliberately separate from the customer session.
 *
 * A customer token must never carry admin scope — different key, different
 * lifetime, and on a real deployment a different cookie domain. Conflating the
 * two is how a storefront XSS becomes a catalogue takeover.
 *
 * In mock mode this checks a demo credential in the browser, which is fine for
 * a demo and is not security. Everything under /admin is client-side, so the
 * guard below hides the UI and nothing more: **the only real protection is your
 * server refusing unauthenticated /admin/* requests.** That is stated here
 * rather than buried in a doc because it is the thing people get wrong.
 */
const KEY = 'loom.admin_session'
const AdminAuthContext = createContext(null)

const DEMO = {
  username: config.adminUser || 'admin',
  password: config.adminPassword || 'admin',
}

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null')
      // A stored session that has aged out is the same as no session.
      if (stored?.expiresAt && Date.now() < stored.expiresAt) setSession(stored)
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode — sign-in simply will not persist */
    }
    setReady(true)
  }, [])

  const signIn = useCallback(async ({ username, password }) => {
    if (isMock) {
      // Constant-ish comparison is pointless here — the credential is public and
      // in the bundle. The demo is a door, not a lock.
      if (username !== DEMO.username || password !== DEMO.password) {
        const err = new Error('Wrong username or password.')
        err.code = 'invalid_credentials'
        throw err
      }
      const next = {
        username,
        token: `demo_${Date.now().toString(36)}`,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* not persisted; the session still works for this tab */
      }
      setSession(next)
      return next
    }

    // api mode: your server decides. Nothing here is trusted.
    const res = await fetch(`${config.api.baseUrl}/admin/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(body?.message || 'Sign-in failed.')
      err.code = body?.code || `http_${res.status}`
      throw err
    }
    const next = { username, token: body.token, expiresAt: Date.now() + 12 * 60 * 60 * 1000 }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* not persisted */
    }
    setSession(next)
    return next
  }, [])

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* already gone */
    }
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, ready, signedIn: !!session, signIn, signOut, demo: isMock ? DEMO : null }),
    [session, ready, signIn, signOut],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>.')
  return ctx
}
