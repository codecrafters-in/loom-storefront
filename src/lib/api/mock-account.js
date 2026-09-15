/**
 * The demo backend's account, after-purchase and community calls, split out of mock.js like mock-admin.js: they load
 * with the first of them and share mock.js's state.
 */
import { ApiError } from './contracts.js'
import { KEY, latency, read, write, login, register, logout, getCart, DEMO_CUSTOMER } from './mock.js'

/** The demo has no questions; asking one is thanked, as if the store will answer. */
export async function getQuestions() {
  await latency()
  return { items: [], total: 0, page: 1, perPage: 5 }
}
export async function askQuestion() {
  await latency()
  return { id: 'q_demo', status: 'pending' }
}
export async function createAlert() {
  await latency()
  return { ok: true, status: 'waiting' }
}
export async function stopAlerts() {
  await latency()
  return { ok: true }
}
export async function confirmNewsletter() {
  await latency()
  return { ok: true }
}
export async function unsubscribeNewsletter() {
  await latency()
  return { ok: true }
}

/** The demo keeps no reviews: a new one is thanked, as if waiting for approval. */
export async function createReview() {
  await latency()
  return { id: 'rev_demo', status: 'pending' }
}

/* ── passwords, invitations, verification ─────────────────────────────── */

/** The demo sends no email: every request succeeds, and any link token works. */
export async function forgotPassword() {
  await latency()
  return { ok: true }
}

export async function resetPassword({ password }) {
  const current = read(KEY.customer, null)
  return login({ email: current?.email || DEMO_CUSTOMER.email, password })
}

export async function signupWithToken({ password }) {
  return register({ email: DEMO_CUSTOMER.email, password })
}

export async function verifyEmail() {
  await latency()
  return { ok: true }
}

export async function resendVerification() {
  await latency()
  return { ok: true, verified: true }
}

/* ── sign-in and privacy ───────────────────────────────────────────────── */

function signedInCustomer() {
  const customer = read(KEY.customer, null)
  if (!customer) throw new ApiError('Not signed in.', { status: 401, code: 'unauthenticated' })
  return customer
}

export async function changePassword({ password }) {
  await latency()
  signedInCustomer()
  if (!password || password.length < 8) throw new ApiError('Please choose a password of at least 8 characters.', { status: 422, code: 'weak_password' })
  return { ok: true }
}

/** The demo sends no email, so the new address applies at once. */
export async function changeEmail({ email }) {
  await latency()
  write(KEY.customer, { ...signedInCustomer(), email })
  return { ok: true, pendingEmail: email, sent: false }
}

export async function confirmEmailChange() {
  await latency()
  return { ok: true, email: read(KEY.customer, null)?.email || DEMO_CUSTOMER.email }
}

export async function exportData() {
  await latency()
  const profile = signedInCustomer()
  const orders = read(KEY.orders, []).filter((order) => order.email === profile.email)
  const data = { exportedAt: new Date().toISOString(), store: 'Demo', profile, orders, savedItems: [], newsletter: [], messages: [] }
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

export async function deleteAccount() {
  signedInCustomer()
  return logout()
}

/** The demo has no company accounts: a customer is on their own, and invitations need a live store. */
export async function getCompany() {
  await latency()
  signedInCustomer()
  return { company: null, role: 'admin', canManage: true, members: [] }
}

async function liveStoreOnly() {
  await latency()
  throw new ApiError('The demo store does not do this.', { status: 422, code: 'demo_only' })
}
export const inviteMember = liveStoreOnly
export const updateMember = liveStoreOnly
export const removeMember = liveStoreOnly
/** The demo has no sales team to send a quote. */
export const requestQuote = liveStoreOnly
/** Demo orders cannot be returned: nothing is ever delivered. */
export async function getOrderReturns() {
  await latency()
  return { options: { days: 30, until: null, methods: [], reasons: [], lines: [] }, items: [] }
}
export async function listReturns() {
  await latency()
  signedInCustomer()
  return { items: [], total: 0, page: 1, perPage: 20 }
}
export const createReturn = liveStoreOnly
export const cancelReturn = liveStoreOnly
/** Demo orders are for looking at: they cannot be cancelled or bought again. */
export const cancelOrder = liveStoreOnly
/** Demo orders carry no messages (`order.messages` is absent), so there is no conversation to write in. */
export const sendOrderMessage = liveStoreOnly
export const reorder = liveStoreOnly

/** The demo store does not offer sign-in by text message (`features.phoneLogin` is off). */
export async function requestLoginCode() {
  await latency()
  return { ok: true }
}

/** The demo offers no sign-in providers (`features.socialLogin` is empty). */
export async function startOAuth() {
  throw new ApiError('This sign-in option is not available in this store.', { status: 404, code: 'oauth_unavailable' })
}

export async function finishOAuth() {
  throw new ApiError('This sign-in has expired. Please try again.', { status: 422, code: 'invalid_state' })
}

export async function verifyLoginCode() {
  throw new ApiError('That code is not right, or it has expired.', { status: 422, code: 'invalid_code' })
}

/** The demo keeps its bag in this browser; there is nothing to recover. */
export async function recoverCart() {
  return getCart()
}
