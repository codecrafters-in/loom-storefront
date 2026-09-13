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
export const ADMIN_SESSION_KEY = 'loom.admin_session'
/** Fired by the API client when the server rejects the admin token. */
export const ADMIN_SIGNED_OUT_EVENT = 'loom:admin-signed-out'
const KEY = ADMIN_SESSION_KEY
const AdminAuthContext = createContext(null)
const TWELVE_HOURS = 12 * 60 * 60 * 1000

const DEMO = {
  username: config.adminUser || 'admin',
  password: config.adminPassword || 'admin',
}

function persist(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    /* not persisted; the session still works for this tab */
  }
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

  // The server is the authority: an expired or revoked token ends the session here too.
  useEffect(() => {
    const onSignedOut = () => setSession(null)
    window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  const signIn = useCallback(async ({ username, password, totp }) => {
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
        expiresAt: Date.now() + TWELVE_HOURS,
      }
      persist(next)
      setSession(next)
      return next
    }

    // api mode: your server decides. Nothing here is trusted.
    const res = await fetch(`${config.api.baseUrl}/admin/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(body?.message || 'Sign-in failed.')
      err.code = body?.code || `http_${res.status}`
      throw err
    }
    const serverExpiry = Date.parse(body?.expiresAt || '')
    const next = {
      username: body?.user?.name || username,
      token: body.token,
      expiresAt: Number.isFinite(serverExpiry) ? serverExpiry : Date.now() + TWELVE_HOURS,
    }
    persist(next)
    setSession(next)
    return next
  }, [])

  const signOut = useCallback(() => {
    const token = session?.token
    if (!isMock && token) {
      // Revoke on the server too, so a copied token stops working. Best effort: the local
      // session ends either way.
      fetch(`${config.api.baseUrl}/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${token}` },
        body: '{}',
      }).catch(() => {})
    }
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* already gone */
    }
    setSession(null)
  }, [session])

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
