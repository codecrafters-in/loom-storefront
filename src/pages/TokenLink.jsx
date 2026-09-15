import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import { Button, Skeleton } from '../components/ui/index.jsx'
import { t, mark } from '../i18n/index.js'

// A link from an email that carries a `token`: what it calls, and what the page says after.
const LINKS = {
  newsletterConfirm: {
    call: 'confirmNewsletter', title: mark('Confirm your subscription'), done: mark('You’re subscribed'),
    doneBody: mark('Thank you. You will get our news and offers by email.'),
    failedBody: mark('It may have expired. Subscribe again at the bottom of any page.'),
  },
  newsletterUnsubscribe: {
    call: 'unsubscribeNewsletter', title: mark('Unsubscribe'), done: mark('You’re unsubscribed'),
    doneBody: mark('We will not email you news or offers any more.'),
    failedBody: mark('It may be out of date. Every newsletter email has a working unsubscribe link.'),
  },
  alertsStop: {
    call: 'stopAlerts', title: mark('Stop alerts'), done: mark('Alerts stopped'),
    doneBody: mark('We will not send you the other alerts you asked for.'),
    failedBody: mark('It may be out of date. Your alerts stop after sending anyway.'),
  },
}

/** `/newsletter/confirm`, `/newsletter/unsubscribe` and `/alerts/unsubscribe` (`?token=`), by `kind`. */
export default function TokenLink({ kind }) {
  const link = LINKS[kind]
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'checking' : 'failed')
  const asked = useRef(false)

  useEffect(() => {
    // Once: StrictMode runs effects twice in development.
    if (!token || asked.current) return
    asked.current = true
    api[link.call](token).then(() => setState('done')).catch(() => setState('failed'))
  }, [token, link])

  return (
    <>
      <Seo title={t(link.title)} noindex />
      <div className="wrap flex justify-center py-16">
        <div className="w-full max-w-sm text-center" role="status">
          {state === 'checking' && <Skeleton className="mx-auto h-8 w-2/3" />}
          {state !== 'checking' && (
            <>
              <h1 className="text-display-md">{state === 'done' ? t(link.done) : t('This link did not work')}</h1>
              <p className="mt-4 text-[15px] text-muted">{state === 'done' ? t(link.doneBody) : t(link.failedBody)}</p>
              {state === 'done'
                ? <Button to="/shop" size="lg" className="mt-8">{t('Keep shopping')}</Button>
                : <Button to="/" size="lg" className="mt-8">{t('Go to the home page')}</Button>}
            </>
          )}
        </div>
      </div>
    </>
  )
}
