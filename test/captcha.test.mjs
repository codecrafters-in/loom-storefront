import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shared } from './helpers/browser.mjs'

/*
 * Captcha is the store's choice, made in Odoo and announced in the settings
 * document. These check the decision — which form sends a token, and when
 * nothing at all is loaded — and that the token reaches the request body.
 * The widget itself is Cloudflare's or Google's and is not tested here.
 */

globalThis.window.location.origin = 'http://localhost'
const { CAPTCHA_ACTIONS, PROVIDERS, captchaFor, recaptchaToken, withCaptcha } = await import('../src/lib/captcha.js')
const http = await import('../src/lib/api/http.js')

const settings = (captcha) => ({ store: { name: 'LOOM' }, security: { captcha } })
const turnstile = { provider: 'turnstile', siteKey: '0x4AAAA', actions: ['login', 'lookup'] }

test('no captcha configured means none, for every form', () => {
  for (const action of CAPTCHA_ACTIONS) {
    assert.equal(captchaFor({}, action, { mock: false }), null)
    assert.equal(captchaFor(settings(null), action, { mock: false }), null)
    assert.equal(captchaFor({ security: {} }, action, { mock: false }), null)
  }
})

test('the demo never loads a captcha, whatever the settings say', () => {
  assert.equal(captchaFor(settings(turnstile), 'login', { mock: true }), null)
  // Tests run without Vite, so the adapter is the mock one by default.
  assert.equal(captchaFor(settings(turnstile), 'login'), null)
})

test('only the forms the store lists ask for a token', () => {
  assert.deepEqual(captchaFor(settings(turnstile), 'login', { mock: false }), { provider: 'turnstile', siteKey: '0x4AAAA', action: 'login' })
  assert.equal(captchaFor(settings(turnstile), 'lookup', { mock: false })?.action, 'lookup')
  assert.equal(captchaFor(settings(turnstile), 'register', { mock: false }), null)
  assert.equal(captchaFor(settings(turnstile), 'newsletter', { mock: false }), null)
})

test('a captcha with no actions list covers every form', () => {
  const everywhere = { provider: 'recaptcha', siteKey: '6Lc-key' }
  for (const action of CAPTCHA_ACTIONS) assert.equal(captchaFor(settings(everywhere), action, { mock: false })?.provider, 'recaptcha')
})

test('an unknown provider, or one with no site key, is ignored rather than half-loaded', () => {
  assert.equal(captchaFor(settings({ provider: 'hcaptcha', siteKey: 'x' }), 'login', { mock: false }), null)
  assert.equal(captchaFor(settings({ provider: 'turnstile', siteKey: '' }), 'login', { mock: false }), null)
})

test('each provider loads from its own script, rendered on demand', () => {
  assert.equal(PROVIDERS.turnstile.script(), 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
  assert.equal(PROVIDERS.recaptcha.script('6Lc key'), 'https://www.google.com/recaptcha/api.js?render=6Lc%20key')
})

test('a token is added to the body only when there is one', () => {
  assert.deepEqual(withCaptcha({ email: 'a@example.com' }, 'tok'), { email: 'a@example.com', captchaToken: 'tok' })
  assert.deepEqual(withCaptcha({ email: 'a@example.com' }, undefined), { email: 'a@example.com' })
})

test('reCAPTCHA v3 is asked for a fresh token for the action, after it says it is ready', async () => {
  const seen = []
  const grecaptcha = {
    ready: (fn) => { seen.push('ready'); fn() },
    execute: async (key, options) => { seen.push(['execute', key, options]); return 'recaptcha-token' },
  }
  assert.equal(await recaptchaToken({ siteKey: '6Lc-key', action: 'newsletter' }, grecaptcha), 'recaptcha-token')
  assert.deepEqual(seen, ['ready', ['execute', '6Lc-key', { action: 'newsletter' }]])
  await assert.rejects(recaptchaToken({ siteKey: 'k', action: 'login' }, undefined), { code: 'captcha_unavailable' })
})

test('the token reaches each protected request, and is absent when there is none', async () => {
  shared.clear()
  const bodies = {}
  globalThis.fetch = async (url, init) => {
    const { pathname } = new URL(url)
    ;(bodies[pathname] ||= []).push(JSON.parse(init.body))
    const answer = pathname.startsWith('/auth/') ? { token: 't', customer: {} } : pathname === '/orders/lookup' ? { id: 'o1' } : { ok: true }
    return new Response(JSON.stringify(answer), { status: 200 })
  }

  await http.login(withCaptcha({ email: 'a@example.com', password: 'secret1' }, 'c-login'))
  await http.register(withCaptcha({ email: 'b@example.com', password: 'secret1', firstName: 'B' }, 'c-register'))
  await http.lookupOrder(withCaptcha({ number: 'S00042', email: 'a@example.com' }, 'c-lookup'))
  await http.subscribe('a@example.com', { captchaToken: 'c-news' })
  await http.subscribe('b@example.com')

  assert.equal(bodies['/auth/login'][0].captchaToken, 'c-login')
  assert.equal(bodies['/auth/register'][0].captchaToken, 'c-register')
  assert.equal(bodies['/auth/register'][0].firstName, 'B')
  assert.equal(bodies['/orders/lookup'][0].captchaToken, 'c-lookup')
  assert.deepEqual(bodies['/newsletter'], [{ email: 'a@example.com', captchaToken: 'c-news' }, { email: 'b@example.com' }])
})
