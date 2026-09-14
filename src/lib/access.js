/**
 * The access token for a store in maintenance or behind a pre-launch password.
 *
 * `POST /access` (the password) or `POST /admin/access` (a signed-in admin) hands
 * one out; every API call then sends it as `X-Loom-Access`. When the backend
 * refuses a call because the store is closed, the token is dropped and the
 * storefront shows the password or maintenance screen again.
 */
const KEY = 'loom.access'
export const ACCESS_HEADER = 'X-Loom-Access'
export const ACCESS_EVENT = 'loom:access-required'

export function accessToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!saved?.token) return ''
    if (saved.expiresAt && Date.parse(saved.expiresAt) < Date.now()) {
      localStorage.removeItem(KEY)
      return ''
    }
    return saved.token
  } catch {
    return ''
  }
}

export function saveAccess({ token, expiresAt }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, expiresAt }))
  } catch {
    // Private mode: the password is asked again on the next page.
  }
}

export function accessRequired(code) {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACCESS_EVENT, { detail: { code } }))
}
