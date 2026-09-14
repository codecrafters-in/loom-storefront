import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { shared, own } from './helpers/browser.mjs'

/*
 * Admin sign-in against a real store: Sign in with Odoo (authorization code +
 * PKCE), then keeping the session alive with rotating refresh tokens.
 *
 * Driven against a fake fetch. What matters here is what the browser sends and
 * what it refuses to send — the server's half is tested in the Odoo module.
 */

const SHOP = 'http://localhost:5173'
globalThis.window.location.origin = SHOP
const assigned = []
globalThis.window.location.assign = (href) => assigned.push(href)
const events = []
globalThis.window.dispatchEvent = (event) => events.push(event.type)

const { config } = await import('../src/lib/config.js')
config.api.baseUrl = 'http://localhost:8069/loom/api/v1/loom'
const auth = await import('../src/lib/admin-session.js')
const http = await import('../src/lib/api/http.js')

const API = '/loom/api/v1/loom'
const KEY = auth.ADMIN_SESSION_KEY
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const later = (ms) => new Date(Date.now() + ms).toISOString()
const grant = (n) => ({
  token: `access-${n}`,
  expiresAt: later(HOUR),
  refreshToken: `refresh-${n}`,
  refreshExpiresAt: later(7 * DAY),
  user: { id: 2, name: 'Mitchell Admin', login: 'admin', email: 'admin@example.com' },
})
const seed = (over = {}) =>
  shared.set(KEY, JSON.stringify({
    username: 'Mitchell Admin',
    token: 'access-1',
    expiresAt: Date.now() + HOUR,
    refreshToken: 'refresh-1',
    refreshExpiresAt: Date.now() + 7 * DAY,
    ...over,
  }))
const stored = () => JSON.parse(shared.get(KEY) ?? 'null')

/** Answer every request with `handler(call)` → `[status, body]`, and record what was sent. */
function serve(handler) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url)
    const call = {
      url: u.toString(),
      path: u.pathname.replace(API, ''),
      method: init.method || 'GET',
      init,
      auth: init.headers?.authorization || '',
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    }
    calls.push(call)
    const [status, body] = await handler(call)
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return calls
}
const tokenCalls = (calls) => calls.filter((c) => c.path === '/admin/auth/token')

beforeEach(() => {
  shared.clear()
  own.clear()
  events.length = 0
  assigned.length = 0
})

/* ── PKCE ──────────────────────────────────────────────────────────────── */

test('the challenge matches RFC 7636 appendix B', async () => {
  const octets = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]
  assert.equal(auth.base64url(new Uint8Array(octets)), 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
  assert.equal(await auth.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
})

test('a verifier is 43 url-safe characters, fresh every time', () => {
  const a = auth.createVerifier()
  assert.match(a, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a, auth.createVerifier())
})

test('the Odoo origin and store code come from the API base URL', () => {
  assert.equal(auth.odooOrigin(), 'http://localhost:8069')
  assert.equal(auth.storeCode(), 'loom')
  assert.equal(auth.storeCode('https://shop.example.com/loom/api/v1/kw-store/'), 'kw-store')
  assert.equal(auth.storeCode('https://api.example.com/v1'), '')
})

/* ── leaving for Odoo ──────────────────────────────────────────────────── */

test('signing in keeps the verifier in this tab and sends Odoo only its challenge', async () => {
  await auth.beginSignIn({ from: '/admin/orders' })

  assert.equal(assigned.length, 1)
  const target = new URL(assigned[0])
  assert.equal(target.origin, 'http://localhost:8069')
  assert.equal(target.pathname, '/loom/admin/authorize')
  assert.equal(target.searchParams.get('store'), 'loom')
  assert.equal(target.searchParams.get('redirect_uri'), `${SHOP}/admin/callback`)
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256')

  const saved = JSON.parse(own.get(auth.PKCE_KEY))
  assert.equal(saved.from, '/admin/orders')
  assert.equal(target.searchParams.get('state'), saved.state)
  assert.ok(saved.state.length >= 22, 'state is at least 16 random bytes')
  assert.equal(target.searchParams.get('code_challenge'), await auth.challengeFor(saved.verifier))
  assert.ok(!assigned[0].includes(saved.verifier), 'the verifier never leaves the browser before the exchange')
  assert.ok(![...shared.values()].some((v) => v.includes(saved.verifier)), 'nor reaches localStorage, which every tab shares')
})

test('where to go afterwards is only ever a path on this site', async () => {
  for (const hostile of ['https://evil.example/admin', '//evil.example', '/\\evil.example', 42]) {
    assert.equal(auth.safeFrom(hostile), '/admin')
  }
  assert.equal(auth.safeFrom('/admin/products/7'), '/admin/products/7')
  await auth.beginSignIn({ from: 'https://evil.example' })
  assert.equal(JSON.parse(own.get(auth.PKCE_KEY)).from, '/admin')
})

test('a base URL that is not a store API refuses before leaving the page', async () => {
  const base = config.api.baseUrl
  config.api.baseUrl = 'https://api.example.com/v1'
  try {
    await assert.rejects(auth.beginSignIn(), { code: 'not_odoo' })
    assert.equal(assigned.length, 0)
  } finally {
    config.api.baseUrl = base
  }
})

/* ── coming back ───────────────────────────────────────────────────────── */

const saveAttempt = (over = {}) =>
  own.set(auth.PKCE_KEY, JSON.stringify({ verifier: 'the-verifier', state: 'state-1', from: '/admin/orders', ...over }))
const refuseAll = () => serve(() => { throw new Error('the API must not be called') })

test('a callback with the wrong state is refused without calling the API', async () => {
  saveAttempt()
  const calls = refuseAll()
  const result = await auth.completeSignIn('?code=abc&state=state-2')
  assert.equal(result.ok, false)
  assert.equal(result.message, 'This sign-in link is no longer valid. Please try again.')
  assert.equal(result.from, '/admin/orders')
  assert.equal(calls.length, 0)
  assert.equal(own.get(auth.PKCE_KEY) ?? null, null, 'the attempt is spent either way')
  assert.equal(stored(), null)
})

test('a callback with no state, or no saved verifier, is refused the same way', async () => {
  const calls = refuseAll()
  saveAttempt()
  assert.equal((await auth.completeSignIn('?code=abc')).message, auth.MESSAGES.stale)
  assert.equal((await auth.completeSignIn('?code=abc&state=state-1')).message, auth.MESSAGES.stale, 'nothing saved in this tab')
  assert.equal(calls.length, 0)
})

test('cancelling on Odoo comes back as a plain sentence', async () => {
  saveAttempt()
  const calls = refuseAll()
  const result = await auth.completeSignIn('?error=access_denied&state=state-1')
  assert.deepEqual([result.ok, result.message], [false, 'Sign-in was cancelled.'])
  assert.equal(calls.length, 0)
  assert.equal(own.get(auth.PKCE_KEY) ?? null, null)
})

test("Odoo's error description is shown only when the state proves Odoo wrote it", async () => {
  refuseAll()
  saveAttempt()
  assert.equal((await auth.completeSignIn('?error=server_error&error_description=Store%20is%20archived&state=state-1')).message, 'Store is archived')
  saveAttempt()
  assert.equal((await auth.completeSignIn('?error=server_error&error_description=Call%20us%20on%20555&state=forged')).message, auth.MESSAGES.failed)
})

test('a good callback trades the code once and stores the session', async () => {
  saveAttempt()
  const calls = serve((c) => (c.path === '/admin/auth/token' ? [200, grant(1)] : [404, {}]))
  // Every test uses its own code: one exchange per callback URL, for the life of the page.
  const search = '?code=good&state=state-1'
  const result = await auth.completeSignIn(search)

  assert.equal(result.ok, true)
  assert.equal(result.from, '/admin/orders')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].url, 'http://localhost:8069/loom/api/v1/loom/admin/auth/token')
  assert.deepEqual(calls[0].body, {
    grant_type: 'authorization_code',
    code: 'good',
    code_verifier: 'the-verifier',
    redirect_uri: `${SHOP}/admin/callback`,
  })

  const session = stored()
  assert.equal(session.username, 'Mitchell Admin')
  assert.equal(session.token, 'access-1')
  assert.equal(session.refreshToken, 'refresh-1')
  assert.ok(Math.abs(session.expiresAt - (Date.now() + HOUR)) < 5000, 'expiry kept in milliseconds')
  assert.ok(Math.abs(session.refreshExpiresAt - (Date.now() + 7 * DAY)) < 5000)
  assert.equal(own.get(auth.PKCE_KEY) ?? null, null)

  // React runs a development effect twice; the second run joins the first.
  assert.equal(await auth.completeSignIn(search), result)
  assert.equal(calls.length, 1)
})

test("a refused code shows the server's message", async () => {
  saveAttempt()
  serve(() => [400, { message: 'That sign-in code has expired. Please sign in again.', code: 'invalid_grant' }])
  const result = await auth.completeSignIn('?code=old&state=state-1')
  assert.deepEqual(
    [result.ok, result.code, result.message],
    [false, 'invalid_grant', 'That sign-in code has expired. Please sign in again.'],
  )
  assert.equal(stored(), null)
  assert.equal(own.get(auth.PKCE_KEY) ?? null, null)
})

/* ── staying signed in ─────────────────────────────────────────────────── */

/** Admin routes accept only `valid`; the token endpoint answers with `grant(next)`. */
const adminServer = ({ valid = 'access-2', refresh = () => [200, grant(2)] } = {}) =>
  serve((c) => {
    if (c.path === '/admin/auth/token') return refresh(c)
    if (c.path.startsWith('/admin/')) return c.auth === `Bearer ${valid}` ? [200, { id: 'S00042' }] : [401, { code: 'unauthenticated' }]
    return [404, {}]
  })

test('an expired access token is renewed once, however many requests need it', async () => {
  seed({ expiresAt: Date.now() - 1000 })
  const calls = adminServer()

  const orders = await Promise.all([http.adminGetOrder('1'), http.adminGetOrder('2'), http.adminGetOrder('3')])

  assert.deepEqual(orders.map((o) => o.id), ['S00042', 'S00042', 'S00042'])
  assert.equal(tokenCalls(calls).length, 1)
  assert.deepEqual(tokenCalls(calls)[0].body, { grant_type: 'refresh_token', refresh_token: 'refresh-1' })
  const adminCalls = calls.filter((c) => c.path.startsWith('/admin/orders'))
  assert.ok(adminCalls.every((c) => c.auth === 'Bearer access-2'), 'every request waited for the new token')
  assert.equal(stored().refreshToken, 'refresh-2', 'the rotated refresh token replaced the spent one')
  assert.equal(stored().username, 'Mitchell Admin')
})

test('a token with under 30 seconds left is renewed before the request leaves', async () => {
  seed({ expiresAt: Date.now() + 10_000 })
  const calls = adminServer()
  await http.adminGetOrder('1')
  assert.equal(tokenCalls(calls).length, 1)
})

test('a fresh token is sent as it is', async () => {
  seed()
  const calls = adminServer({ valid: 'access-1' })
  await http.adminGetOrder('1')
  assert.equal(tokenCalls(calls).length, 0)
})

test('a 401 is retried once, after a refresh', async () => {
  seed()
  const calls = adminServer()
  const order = await http.adminGetOrder('1')
  assert.equal(order.id, 'S00042')
  assert.deepEqual(calls.map((c) => [c.path, c.auth || '-']), [
    ['/admin/orders/1', 'Bearer access-1'],
    ['/admin/auth/token', '-'],
    ['/admin/orders/1', 'Bearer access-2'],
  ])
  assert.deepEqual(events, [])
})

test('a second 401 ends the session instead of looping', async () => {
  seed()
  const calls = adminServer({ valid: 'nothing' })
  await assert.rejects(http.adminGetOrder('1'), { status: 401 })
  assert.equal(calls.filter((c) => c.path === '/admin/orders/1').length, 2)
  assert.equal(tokenCalls(calls).length, 1)
  assert.equal(stored(), null)
  assert.deepEqual(events, [auth.ADMIN_SIGNED_OUT_EVENT])
})

test('a refused refresh signs out, and the request is not sent with a dead token', async () => {
  seed({ expiresAt: Date.now() - 1000 })
  const calls = adminServer({ refresh: () => [401, { code: 'invalid_grant', message: 'Please sign in again.' }] })
  await assert.rejects(http.adminGetOrder('1'), { status: 401, code: 'invalid_grant' })
  assert.equal(calls.filter((c) => c.path === '/admin/orders/1').length, 0)
  assert.equal(stored(), null)
  assert.deepEqual(events, [auth.ADMIN_SIGNED_OUT_EVENT])
})

test('an expired refresh token signs out without asking the server', async () => {
  seed({ expiresAt: Date.now() - 1000, refreshExpiresAt: Date.now() - 1000 })
  const calls = adminServer()
  await assert.rejects(http.adminGetOrder('1'), { status: 401 })
  assert.equal(tokenCalls(calls).length, 0)
  assert.equal(stored(), null)
  assert.deepEqual(events, [auth.ADMIN_SIGNED_OUT_EVENT])
})

test('a network failure while renewing keeps the session', async () => {
  seed({ expiresAt: Date.now() - 1000 })
  serve((c) => {
    if (c.path === '/admin/auth/token') throw new TypeError('Failed to fetch')
    return [200, {}]
  })
  await assert.rejects(http.adminGetOrder('1'), { code: 'network_error' })
  assert.equal(stored().refreshToken, 'refresh-1')
  assert.deepEqual(events, [])
})

test("two tabs renewing at once spend the refresh token once, and the second uses the first's", async () => {
  // A Web Lock, as a browser grants it: one holder at a time, in order.
  let tail = Promise.resolve()
  const locks = {
    request: (_name, fn) => {
      const run = tail.then(() => fn())
      tail = run.catch(() => {})
      return run
    },
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true, writable: true })

  try {
    // Two copies of the module are two tabs: separate memory, shared localStorage.
    const tabA = await import('../src/lib/admin-session.js?tab=a')
    const tabB = await import('../src/lib/admin-session.js?tab=b')
    seed({ expiresAt: Date.now() - 1000 })

    const spent = new Set()
    const calls = serve((c) => {
      const presented = c.body.refresh_token
      // What the server does with a reused refresh token: revoke everything.
      if (spent.has(presented)) return [401, { code: 'invalid_grant', message: 'Session revoked.' }]
      spent.add(presented)
      return [200, grant(2)]
    })
    const sent = []
    const send = (tab) => async (token) => {
      sent.push([tab, token])
      return new Response('{}', { status: 200 })
    }

    await Promise.all([tabA.adminFetch(send('a')), tabB.adminFetch(send('b'))])

    assert.equal(calls.length, 1, 'one refresh between the two tabs')
    assert.deepEqual(sent.sort(), [['a', 'access-2'], ['b', 'access-2']])
    assert.equal(stored().refreshToken, 'refresh-2')
    assert.deepEqual(events, [])
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete globalThis.navigator
  }
})

test('uploads renew and retry the same way', async () => {
  seed()
  const calls = serve((c) => {
    if (c.path === '/admin/auth/token') return [200, grant(2)]
    return c.auth === 'Bearer access-2' ? [200, { id: 'm1', url: '/media/m1.jpg' }] : [401, {}]
  })
  const media = await http.uploadMedia(new Blob(['jpeg'], { type: 'image/jpeg' }))
  assert.equal(media.id, 'm1')
  const uploads = calls.filter((c) => c.path === '/admin/media')
  assert.equal(uploads.length, 2)
  assert.ok(uploads.every((c) => c.init.body instanceof FormData))
})

/* ── signing out ───────────────────────────────────────────────────────── */

test('signing out revokes both tokens on the server and forgets the session here', async () => {
  seed()
  const calls = serve(() => [200, { ok: true }])
  await auth.revokeAdminSession()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/admin/auth/logout')
  assert.equal(calls[0].auth, 'Bearer access-1')
  assert.deepEqual(calls[0].body, { refresh_token: 'refresh-1' })
  assert.equal(stored(), null)
})

test('signing out still forgets the session when the server cannot be reached', async () => {
  seed()
  serve(() => { throw new TypeError('Failed to fetch') })
  await auth.revokeAdminSession()
  assert.equal(stored(), null)
})

/* ── what is never sent ────────────────────────────────────────────────── */

test('no request asks for cookies: auth is the header and nothing else', async () => {
  seed()
  shared.set('loom.session', JSON.stringify({ token: 'customer-1' }))
  saveAttempt()
  const calls = serve((c) => {
    if (c.path === '/admin/auth/token') return [200, grant(1)]
    if (c.path === '/auth/login') return [200, { token: 'customer-2', customer: {} }]
    return [200, { id: 'x', items: [], total: 0 }]
  })

  await http.getCountry('IN')
  await http.login({ email: 'a@example.com', password: 'secret1' })
  await http.adminGetOrder('1')
  await http.uploadMedia(new Blob(['x']))
  await auth.completeSignIn('?code=cookie-check&state=state-1')
  await auth.revokeAdminSession()

  assert.equal(calls.length, 6)
  for (const c of calls) assert.ok(!('credentials' in c.init), `${c.method} ${c.path} sets credentials`)
})

test('there is no build-time token: a visitor sends no Authorization, and a shopper sends their own', async () => {
  assert.ok(!('token' in config.api), 'VITE_API_TOKEN is gone from the config')
  const calls = serve(() => [200, { code: 'IN', states: [] }])

  await assert.rejects(http.getMe(), { status: 401, code: 'unauthenticated' })
  assert.equal(calls.length, 0, 'signed out is known without asking')

  await http.getCountry('IN')
  assert.equal(calls[0].auth, '')

  shared.set('loom.session', JSON.stringify({ token: 'customer-1' }))
  await http.getCountry('FR')
  assert.equal(calls[1].auth, 'Bearer customer-1')
})
