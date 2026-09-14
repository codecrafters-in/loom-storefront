import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui/index.jsx'
import { CONSENT_OPEN_EVENT, chooseConsent, startConsent } from '../../lib/consent.js'
import { t, mark } from '../../i18n/index.js'

const LABELS = {
  analytics: [mark('Analytics'), mark('Helps us understand how the shop is used, so we can improve it.')],
  marketing: [mark('Marketing'), mark('Lets us and our partners show you relevant offers elsewhere.')],
}

/**
 * The cookie banner and its preferences, for a store that asks for consent.
 * Its own chunk, loaded only for such a store.
 */
export default function ConsentBanner({ consent }) {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [choices, setChoices] = useState({ analytics: false, marketing: false })
  const first = useRef(null)
  const categories = (consent.categories || []).filter((c) => LABELS[c])

  useEffect(() => {
    const saved = startConsent(consent)
    if (saved) setChoices(saved)
    else setOpen(true)
    const reopen = () => {
      setDetails(true)
      setOpen(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [consent])

  useEffect(() => {
    if (open) first.current?.focus()
  }, [open, details])

  if (!open) return null

  const decide = async (next) => {
    setChoices(await chooseConsent(consent, next))
    setOpen(false)
    setDetails(false)
  }
  const all = Object.fromEntries(categories.map((c) => [c, true]))

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xs border border-line bg-page p-5 shadow-panel sm:inset-x-6 sm:bottom-6"
    >
      <h2 id="consent-title" className="font-sans text-[15px] font-medium">{t('Cookies')}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        {t('We use the cookies this shop needs to work.')}
        {categories.length > 0 && ` ${t('With your permission, we also use cookies for the purposes below.')}`}
        {consent.policyUrl && (
          <>
            {' '}
            <Link to={consent.policyUrl} className="text-accent link-underline">{t('Privacy policy')}</Link>
          </>
        )}
      </p>

      {details && categories.length > 0 && (
        <fieldset className="mt-4 space-y-3">
          <legend className="sr-only">{t('Cookie preferences')}</legend>
          {categories.map((c) => (
            <label key={c} className="flex items-start gap-3 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(choices[c])}
                onChange={(e) => setChoices((v) => ({ ...v, [c]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
              />
              <span>
                <span className="font-medium text-ink">{t(LABELS[c][0])}</span>
                <span className="block text-muted">{t(LABELS[c][1])}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {details ? (
          <Button ref={first} size="sm" onClick={() => decide(choices)}>{t('Save preferences')}</Button>
        ) : (
          <Button ref={first} size="sm" onClick={() => decide(all)}>{t('Accept all')}</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => decide({})}>{t('Only necessary')}</Button>
        {!details && categories.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>{t('Preferences')}</Button>
        )}
      </div>
    </div>
  )
}
