import { useCallback, useEffect, useRef, useState } from 'react'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { loadScript } from '../lib/payments/load-script.js'
import { PROVIDERS, captchaFor, notLoaded, notReady, recaptchaToken } from '../lib/captcha.js'

/** How long a submit waits for Turnstile to finish a check that is still running. */
const WAIT_MS = 10_000

/**
 * The captcha for one form.
 *
 *   const captcha = useCaptcha('lookup')
 *   …{captcha.widget}                       // where Turnstile's box goes; null otherwise
 *   const captchaToken = await captcha.getToken()
 *   …after the request: captcha.reset()
 *
 * Everything is inert when the store has no captcha: `widget` is null,
 * `getToken()` resolves undefined, and no script is requested.
 *
 * `defer` waits for `activate()` before loading anything. The newsletter form
 * sits in the footer of every page, and a shopper who never touches it should
 * not download a captcha to read a product page.
 */
export function useCaptcha(action, { defer = false } = {}) {
  const settings = useStorefront()
  const captcha = captchaFor(settings, action)
  const provider = captcha?.provider || null
  const siteKey = captcha?.siteKey || ''

  const [active, setActive] = useState(!defer)
  const box = useRef(null)
  const widgetId = useRef(null)
  const token = useRef('')
  const failed = useRef(false)
  const waiting = useRef([])

  useEffect(() => {
    if (!provider || !active) return undefined
    let alive = true
    failed.current = false

    const settle = (value, error) => {
      const list = waiting.current.splice(0)
      for (const w of list) (error ? w.reject(error) : w.resolve(value))
    }

    loadScript(PROVIDERS[provider].script(siteKey))
      .then(() => {
        if (!alive || provider !== 'turnstile' || !box.current) return
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          callback: (value) => {
            token.current = value
            settle(value)
          },
          'expired-callback': () => {
            token.current = ''
          },
        })
      })
      .catch(() => {
        failed.current = true
        settle(undefined, notLoaded())
      })

    return () => {
      alive = false
      token.current = ''
      if (widgetId.current !== null) {
        try {
          window.turnstile?.remove(widgetId.current)
        } catch {
          /* the widget went with the page */
        }
        widgetId.current = null
      }
    }
  }, [provider, siteKey, action, active])

  const activate = useCallback(() => setActive(true), [])

  const getToken = useCallback(async () => {
    if (!provider) return undefined
    setActive(true)

    if (provider === 'recaptcha') {
      await loadScript(PROVIDERS.recaptcha.script(siteKey)).catch(() => {
        throw notLoaded()
      })
      return recaptchaToken({ siteKey, action })
    }

    if (token.current) return token.current
    if (failed.current) throw notLoaded()
    // Turnstile usually passes without a click, but not instantly. A shopper
    // who submits in the first second waits for it rather than being refused.
    return new Promise((resolve, reject) => {
      const entry = {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      }
      const timer = setTimeout(() => {
        waiting.current = waiting.current.filter((w) => w !== entry)
        reject(notReady())
      }, WAIT_MS)
      waiting.current.push(entry)
    })
  }, [provider, siteKey, action])

  /** Tokens are single-use: after any submit that spent one, ask for another. */
  const reset = useCallback(() => {
    token.current = ''
    if (provider === 'turnstile' && widgetId.current !== null) {
      try {
        window.turnstile?.reset(widgetId.current)
      } catch {
        /* nothing to reset */
      }
    }
  }, [provider])

  const widget = provider === 'turnstile' ? <div ref={box} className="min-h-0" data-captcha={action} /> : null

  return { enabled: Boolean(provider), widget, getToken, reset, activate }
}
