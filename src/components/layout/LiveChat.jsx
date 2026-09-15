import { useEffect } from 'react'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { consentState } from '../../lib/analytics.js'

/**
 * Odoo's own live chat (`features.liveChat`: the website's channel), loaded once the page is idle so it never slows
 * the first view. Odoo's loader script draws the chat button itself. A store that asks for cookie consent gets the
 * chat only from visitors who allowed it (the chat keeps a visitor cookie).
 */
export default function LiveChat() {
  const chat = useStorefront().features?.liveChat
  const url = chat?.provider === 'odoo' ? chat.loaderUrl : null

  useEffect(() => {
    if (!url || document.querySelector('script[data-loom-chat]')) return undefined
    const consent = consentState()
    if (consent && !consent.analytics) return undefined
    const load = () => {
      const script = document.createElement('script')
      script.src = url
      script.defer = true
      script.dataset.loomChat = 'odoo'
      document.body.appendChild(script)
    }
    if (window.requestIdleCallback) {
      const handle = window.requestIdleCallback(load, { timeout: 4000 })
      return () => window.cancelIdleCallback(handle)
    }
    const handle = window.setTimeout(load, 2500)
    return () => window.clearTimeout(handle)
  }, [url])

  return null
}
