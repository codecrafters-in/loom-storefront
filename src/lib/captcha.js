/**
 * Captcha, when the store asks for one — and only then.
 *
 * The store switches it on in Odoo, and the settings document says so under
 * `security.captcha`. With it off, or in the demo, nothing here runs: no
 * widget, no third-party script, no request to Cloudflare or Google. A theme
 * that loads a captcha on every page "just in case" charges every shopper for
 * the few forms a bot would bother with.
 *
 * The token goes in the JSON body as `captchaToken`. Tokens are single-use on
 * both providers, so every submit needs a fresh one.
 */
import { isMock } from './config.js'
import { ApiError } from './api/contracts.js'

/** The forms that can ask for one. The names are the ones the settings document lists. */
export const CAPTCHA_ACTIONS = ['login', 'register', 'lookup', 'newsletter']

export const PROVIDERS = {
  // Explicit rendering: the widget goes where the form puts it, when the form
  // is on screen, instead of scanning the page for a magic class at load.
  turnstile: { script: () => 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit' },
  // v3 is invisible: no widget, a token asked for at submit time.
  recaptcha: { script: (siteKey) => `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}` },
}

/**
 * The captcha one form needs, or null.
 *
 * A captcha without an `actions` list applies to every form: sending a token a
 * server did not ask for costs nothing, while leaving one out that it did ask
 * for is a form nobody can submit.
 */
export function captchaFor(settings, action, { mock = isMock } = {}) {
  if (mock) return null
  const captcha = settings?.security?.captcha
  if (!captcha || !PROVIDERS[captcha.provider] || !captcha.siteKey) return null
  if (Array.isArray(captcha.actions) && !captcha.actions.includes(action)) return null
  return { provider: captcha.provider, siteKey: captcha.siteKey, action }
}

/** The body with the token in it, or the body untouched when there is no token. */
export const withCaptcha = (body, captchaToken) => (captchaToken ? { ...body, captchaToken } : body)

export const notLoaded = () =>
  new ApiError('The security check did not load. A content blocker or a lost connection will do this.', {
    code: 'captcha_unavailable',
  })

export const notReady = () =>
  new ApiError('The security check has not finished yet. Give it a moment and try again.', { code: 'captcha_pending' })

/** A fresh reCAPTCHA v3 token for one action. The script must already be loaded. */
export async function recaptchaToken({ siteKey, action }, grecaptcha = globalThis.window?.grecaptcha) {
  if (typeof grecaptcha?.ready !== 'function' || typeof grecaptcha?.execute !== 'function') throw notLoaded()
  await new Promise((resolve) => grecaptcha.ready(resolve))
  return grecaptcha.execute(siteKey, { action })
}
