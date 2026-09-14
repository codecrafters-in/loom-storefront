import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from './ui/index.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { docsLinkVisible } from '../lib/docs-link.js'
import { t } from '../i18n/index.js'

/**
 * A way into the documentation and the back office, on a demo.
 *
 * A footer link is enough for somebody who has decided to look; it is not
 * enough for somebody two clicks into a shop they have never seen, wondering
 * whether the thing has an admin at all. This is the answer to "how do I check
 * the docs without logging in" — you do not log in, and the way in is on the
 * screen.
 *
 * It shows only on the demo. Against a real API it disappears and the back
 * office link in the admin sidebar is the only one left, which is right: the
 * merchant knows where their own settings are and their customers should never
 * meet a Docs button.
 *
 * Dismissible, and the dismissal sticks. Something fixed to the corner of every
 * page with no way to remove it is an advertisement.
 */
const KEY = 'loom.demo-bar.dismissed'

/** Pages where a floating pill is in the way rather than in reach. */
const QUIET = ['/docs', '/checkout', '/cart']

export default function DemoBar() {
  const config = useStorefront()
  const { pathname } = useLocation()
  /**
   * Starts shown on the server and on the first client render, then hides if
   * this browser dismissed it. Reading storage during render would prerender
   * one answer and hydrate another.
   */
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) setDismissed(true)
    } catch {
      // Private mode. Showing it is the safe failure.
    }
  }, [])

  const hide = () => {
    setDismissed(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // Then it comes back next time, which is a smaller problem than throwing.
    }
  }

  if (dismissed || !docsLinkVisible(config)) return null
  if (QUIET.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null

  return (
    <div
      // Bottom right, where a page's own controls are not. Above the product
      // page's sticky buy bar (z-30) and below the toasts and the mobile
      // sheets (z-50), which are things somebody asked for.
      className="fixed bottom-5 end-5 z-40 hidden items-center gap-2 rounded-full border border-line bg-page/95 py-1.5 ps-3.5 pe-1.5 shadow-lift backdrop-blur sm:flex"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{t('demo')}</span>
      <span className="h-3.5 w-px bg-line" aria-hidden="true" />

      <Link
        to="/docs"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-ink transition-colors hover:bg-sunken"
      >
        <Icon name="info" size={14} />
        {t('Docs & API')}
      </Link>

      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <Icon name="user" size={14} />
        {t('Back office')}
      </Link>

      <button
        type="button"
        onClick={hide}
        aria-label={t('Hide the demo links')}
        className="grid h-6 w-6 place-items-center rounded-full text-faint transition-colors hover:bg-sunken hover:text-ink"
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  )
}
