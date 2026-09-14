import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { config, isMock } from '../lib/config.js'
import {
  ADMIN_SESSION_KEY,
  ADMIN_SIGNED_OUT_EVENT,
  beginSignIn,
  completeSignIn as finishSignIn,
  readSession,
  revokeAdminSession,
  sessionAlive,
} from '../lib/admin-session.js'

/**
 * Admin session, kept deliberately separate from the customer session.
 *
 * A customer token must never carry admin scope — different key, different
 * lifetime, and on a real deployment a different cookie domain. Conflating the
 * two is how a storefront XSS becomes a catalogue takeover.
 *
 * In mock mode this checks a demo credential in the browser, which is fine for
 * a demo and is not security. Against a real store the password is never typed
 * here at all: signing in goes to Odoo's own login page and comes back through
 * /admin/callback (lib/admin-session.js has the why).
 *
 * Everything under /admin is client-side, so the guard below hides the UI and
 * nothing more: **the only real protection is your server refusing
 * unauthenticated /admin/* requests.** That is stated here rather than buried in
 * a doc because it is the thing people get wrong.
 */
export { ADMIN_SESSION_KEY, ADMIN_SIGNED_OUT_EVENT }
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
    const stored = readSession()
    // A stored session that has aged out — no live access token and no refresh
    // token to get one — is the same as no session.
    if (sessionAlive(stored)) setSession(stored)
    else {
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* private mode — sign-in simply will not persist */
      }
    }
    setReady(true)
  }, [])

  // The server is the authority: an expired or revoked token ends the session here too.
  useEffect(() => {
    const onSignedOut = () => setSession(null)
    window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  // Tokens rotate, and any tab may be the one that rotated them — so storage is
  // the truth, and a sign-out in one tab is a sign-out in all of them.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== null && e.key !== KEY) return
      const next = readSession()
      setSession(sessionAlive(next) ? next : null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /**
   * Mock mode: `{ username, password }`, checked here. Api mode: `{ from }`,
   * and the browser leaves for Odoo — the promise only settles if it cannot.
   */
  const signIn = useCallback(async ({ username, password, from } = {}) => {
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

    await beginSignIn({ from })
    return null
  }, [])

  /** The callback page's half. Resolves `{ ok, from, message }`; never throws. */
  const completeSignIn = useCallback(async (search) => {
    const result = await finishSignIn(search)
    if (result.ok) setSession(result.session)
    return result
  }, [])

  const signOut = useCallback(() => {
    if (isMock) {
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* already gone */
      }
    } else {
      // Revoke on the server too, so a copied token stops working. It reads the
      // tokens from storage rather than from state, because a refresh may have
      // rotated them since this tab last rendered.
      revokeAdminSession()
    }
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, ready, signedIn: !!session, signIn, completeSignIn, signOut, demo: isMock ? DEMO : null }),
    [session, ready, signIn, completeSignIn, signOut],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth must be used inside <AdminAuthProvider>.')
  return ctx
}
