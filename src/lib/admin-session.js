/**
 * The admin session against a real backend: sign in with Odoo, keep the
 * session alive, end it.
 *
 * The password is never typed on the shop's domain. The storefront sends the
 * browser to Odoo's own login page — which already knows about two-factor,
 * password policy and lockouts — and Odoo sends it back with a one-time code.
 * That code is worthless without the verifier this tab kept to itself (PKCE,
 * RFC 7636), so a code leaked through a referrer, a log or a browser extension
 * cannot be spent by anyone else.
 *
 * What comes back is a short access token (about an hour) and a refresh token
 * (about a week). Refresh tokens rotate: each one works exactly once, and the
 * server treats a second use as theft and revokes the whole session. Everything
 * below the refresh section exists to make sure this browser never spends one
 * twice — not two requests in one tab, and not two tabs at once.
 *
 * Mock mode never reaches this file; the demo keeps its own credential check in
 * AdminAuthContext.
 */
import { config } from './config.js'
import { ApiError } from './api/contracts.js'

export const ADMIN_SESSION_KEY = 'loom.admin_session'
/** Fired when the server ends the admin session, so the panel asks to sign in again. */
export const ADMIN_SIGNED_OUT_EVENT = 'loom:admin-signed-out'
/** sessionStorage, not localStorage: the verifier belongs to the tab that started the sign-in. */
export const PKCE_KEY = 'loom.admin_pkce'
export const CALLBACK_PATH = '/admin/callback'

/** Renew this long before the access token runs out, so a request never leaves with a token that dies in flight. */
const RENEW_EARLY_MS = 30 * 1000
const HOUR = 60 * 60 * 1000
const REFRESH_LOCK = 'loom.admin_refresh'

export const MESSAGES = {
  cancelled: 'Sign-in was cancelled.',
  stale: 'This sign-in link is no longer valid. Please try again.',
  failed: 'Sign-in with Odoo did not complete. Please try again.',
  ended: 'Your admin session has ended. Please sign in again.',
}

/* ── PKCE ──────────────────────────────────────────────────────────────── */

export function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomString = (size) => base64url(crypto.getRandomValues(new Uint8Array(size)))

/** 32 random bytes, which is 43 characters — the shortest verifier the RFC allows, and plenty. */
export const createVerifier = () => randomString(32)

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/* ── where Odoo is ─────────────────────────────────────────────────────── */

const parseBase = (baseUrl) => new URL(baseUrl, window.location.origin)

/** `http://localhost:8069/loom/api/v1/loom` → `http://localhost:8069`. */
export const odooOrigin = (baseUrl = config.api.baseUrl) => parseBase(baseUrl).origin

/** `http://localhost:8069/loom/api/v1/loom` → `loom`: the segment after `/loom/api/v1/`. */
export function storeCode(baseUrl = config.api.baseUrl) {
  const match = parseBase(baseUrl).pathname.match(/\/loom\/api\/v1\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : ''
}

export const callbackUrl = () => `${window.location.origin}${CALLBACK_PATH}`

/**
 * Only a path on this site. `from` rides along through Odoo and back, and a
 * sign-in that ends on whatever URL was put there is an open redirect with a
 * trusted login page in front of it.
 */
export const safeFrom = (from) =>
  typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/\\') ? from : '/admin'

const endpoint = (path) => new URL(config.api.baseUrl + path, window.location.origin).toString()

/* ── the session in storage ────────────────────────────────────────────── */

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

function writeSession(session) {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
  } catch {
    /* not persisted; the session still works for this tab */
  }
}

function forgetSession() {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {
    /* already gone */
  }
}

/** The server ended the session: forget it, and tell the panel. */
export function endAdminSession() {
  forgetSession()
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(ADMIN_SIGNED_OUT_EVENT))
  }
}

/** Good for a request that leaves now, with margin to spare. */
export const accessFresh = (s, now = Date.now()) => Boolean(s?.token) && now < (s.expiresAt || 0) - RENEW_EARLY_MS
export const refreshUsable = (s, now = Date.now()) => Boolean(s?.refreshToken) && now < (s.refreshExpiresAt || 0)
/** Signed in as far as this browser can tell: a live access token, or a way to get one. */
export const sessionAlive = (s, now = Date.now()) =>
  (Boolean(s?.token) && now < (s.expiresAt || 0)) || refreshUsable(s, now)

const toMs = (iso, fallback) => {
  const ms = Date.parse(iso || '')
  return Number.isFinite(ms) ? ms : fallback
}

/** The token endpoint's answer, in the shape kept under `loom.admin_session`. Dates become milliseconds. */
export function toSession(body, previous = null) {
  const now = Date.now()
  return {
    username: body?.user?.name || body?.user?.login || previous?.username || '',
    token: body.token,
    expiresAt: toMs(body.expiresAt, now + HOUR),
    refreshToken: body.refreshToken || '',
    refreshExpiresAt: body.refreshToken ? toMs(body.refreshExpiresAt, now + 7 * 24 * HOUR) : 0,
  }
}

async function tokenRequest(body) {
  let res
  try {
    res = await fetch(endpoint('/admin/auth/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new ApiError(`Could not reach ${config.api.baseUrl}. Check VITE_API_BASE_URL and that the server sends CORS headers for this origin.`, {
      code: 'network_error',
      detail: err.message,
    })
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(json?.message || `Sign-in failed with ${res.status}.`, {
      status: res.status,
      code: json?.code || `http_${res.status}`,
      detail: json,
    })
  }
  if (!json?.token) throw new ApiError('The sign-in answer carried no token.', { status: res.status, code: 'bad_response', detail: json })
  return json
}

/* ── signing in ────────────────────────────────────────────────────────── */

/**
 * Leave for Odoo's authorize page.
 *
 * Resolves with the URL it went to, which is only useful to a test: in a
 * browser the page is already unloading.
 */
export async function beginSignIn({ from, baseUrl = config.api.baseUrl } = {}) {
  // crypto.subtle only exists on https and localhost. Opening the dev server on
  // a LAN address is the usual way to meet this, and the browser's own error
  // ("cannot read properties of undefined") says nothing useful.
  if (!globalThis.crypto?.subtle) {
    throw new ApiError('Signing in needs a secure page: open the store over https, or on localhost.', { code: 'insecure_context' })
  }
  const store = storeCode(baseUrl)
  if (!store) {
    throw new ApiError('VITE_API_BASE_URL does not look like a LOOM store API (…/loom/api/v1/<store>), so there is no Odoo to sign in with.', {
      code: 'not_odoo',
    })
  }

  const verifier = createVerifier()
  const state = randomString(24)
  const challenge = await challengeFor(verifier)
  try {
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, from: safeFrom(from) }))
  } catch {
    throw new ApiError('This browser is blocking site storage, which signing in needs.', { code: 'storage_blocked' })
  }

  const params = new URLSearchParams({
    store,
    redirect_uri: callbackUrl(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  const target = `${odooOrigin(baseUrl)}/loom/admin/authorize?${params}`
  window.location.assign(target)
  return target
}

/** Read and forget what `beginSignIn` saved. One attempt, one use. */
function takePkce() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null')
    sessionStorage.removeItem(PKCE_KEY)
    return saved
  } catch {
    return null
  }
}

/**
 * What the return URL says, checked against what this tab saved.
 *
 * Pure apart from clearing the saved verifier, so the refusal cases can be
 * tested without a network. A state that does not match means this tab did not
 * start this sign-in — a forged link, an old bookmark, or a second tab — and
 * the code is not exchanged, because exchanging it would sign this browser in
 * as whoever started it.
 */
export function resolveCallback(search) {
  const params = new URLSearchParams(search)
  const saved = takePkce()
  const from = safeFrom(saved?.from)
  const state = params.get('state')
  const stateMatches = Boolean(saved?.verifier && saved?.state && state && saved.state === state)

  const error = params.get('error')
  if (error === 'access_denied') return { ok: false, from, code: error, message: MESSAGES.cancelled }
  if (error) {
    // The description is only shown when the state proves Odoo wrote it.
    // Otherwise it is text anybody can put in a link, shown on the login page.
    const described = stateMatches && params.get('error_description')
    return { ok: false, from, code: error, message: described || MESSAGES.failed }
  }

  const code = params.get('code')
  if (!code || !stateMatches) return { ok: false, from, code: 'invalid_state', message: MESSAGES.stale }
  return { ok: true, from, code, verifier: saved.verifier }
}

async function exchange(search) {
  const checked = resolveCallback(search)
  if (!checked.ok) return checked
  try {
    const body = await tokenRequest({
      grant_type: 'authorization_code',
      code: checked.code,
      code_verifier: checked.verifier,
      redirect_uri: callbackUrl(),
    })
    const session = toSession(body)
    writeSession(session)
    return { ok: true, from: checked.from, session }
  } catch (err) {
    return { ok: false, from: checked.from, code: err.code, message: err.message || MESSAGES.failed }
  }
}

const completions = new Map()

/**
 * Finish a sign-in from the callback URL's query string.
 *
 * One exchange per URL. React runs a development effect twice, and the second
 * run would find the verifier already spent and report a failed sign-in over
 * a successful one.
 */
export function completeSignIn(search) {
  if (!completions.has(search)) completions.set(search, exchange(search))
  return completions.get(search)
}

/* ── keeping it alive ──────────────────────────────────────────────────── */

let refreshing = null

/**
 * One refresh at a time — in this tab by sharing the promise, across tabs by
 * holding a Web Lock while the token rotates.
 *
 * Without the lock, two tabs whose access tokens expire in the same minute both
 * spend the same refresh token, and the server does what it must with a reused
 * one: revokes the session, signing both out. Browsers without Web Locks (old
 * Safari) keep the in-tab guarantee and risk that rare case.
 */
export function refreshAdminSession(stale) {
  if (!refreshing) {
    refreshing = withRefreshLock(() => rotate(stale)).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

function withRefreshLock(fn) {
  const locks = globalThis.navigator?.locks
  return typeof locks?.request === 'function' ? locks.request(REFRESH_LOCK, fn) : fn()
}

const ended = () => new ApiError(MESSAGES.ended, { status: 401, code: 'unauthenticated' })

async function rotate(stale) {
  // Read storage again now that this tab holds the lock: the session it
  // remembers may be one another tab has already rotated.
  const current = readSession()
  if (!current?.token) throw ended()
  if (current.token !== stale?.token && accessFresh(current)) return current
  if (!refreshUsable(current)) {
    endAdminSession()
    throw ended()
  }

  let body
  try {
    body = await tokenRequest({ grant_type: 'refresh_token', refresh_token: current.refreshToken })
  } catch (err) {
    // Refused means expired, revoked or already used: the session is over. A
    // network error or a 500 is not a verdict, so the session is kept.
    if (err.status === 400 || err.status === 401) endAdminSession()
    throw err
  }
  const next = toSession(body, current)
  writeSession(next)
  return next
}

/** The access token to send now, renewed first when it is about to run out. */
async function accessToken(session) {
  if (!session?.token) return ''
  if (accessFresh(session)) return session.token
  if (refreshUsable(session)) return (await refreshAdminSession(session)).token
  // No way to renew: use what is left of it, and let the server have the last word.
  return Date.now() < (session.expiresAt || 0) ? session.token : ''
}

/**
 * Run an /admin request with the admin token, renewing it when needed.
 *
 * `send(token)` makes the request and returns the Response; it may be called
 * twice. A 401 is retried exactly once, after a refresh — the token may have
 * been rotated by another tab or revoked early — and a second 401 ends the
 * session rather than looping.
 */
export async function adminFetch(send) {
  const session = readSession()
  const token = await accessToken(session)
  const res = await send(token)
  if (res.status !== 401) return res

  if (!session?.token) {
    endAdminSession()
    return res
  }
  let next
  try {
    next = await refreshAdminSession({ ...session, token })
  } catch (err) {
    if (err.code === 'unauthenticated' || err.status === 400 || err.status === 401) return res
    throw err
  }
  const retried = await send(next.token)
  if (retried.status === 401) endAdminSession()
  return retried
}

/* ── signing out ───────────────────────────────────────────────────────── */

/**
 * Revoke on the server, then forget locally.
 *
 * Best effort: the request is sent with whatever this browser holds and the
 * local session ends whether or not it arrives. The refresh token goes in the
 * body because it is the long-lived half — revoking only the access token would
 * leave a week-long credential alive in whatever copied it.
 */
export function revokeAdminSession(session = readSession()) {
  let sent = Promise.resolve()
  if (session?.token) {
    sent = fetch(endpoint('/admin/auth/logout'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify(session.refreshToken ? { refresh_token: session.refreshToken } : {}),
    }).then(
      () => undefined,
      () => undefined,
    )
  }
  forgetSession()
  return sent
}
