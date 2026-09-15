import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import { useAuth } from '../store/AuthContext.jsx'
import { Button, Skeleton } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'

/** The link sent to a new sign-in email (`/confirm-email?token=`): the account signs in with it from now on. */
export default function ConfirmEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'checking' : 'failed')
  const [email, setEmail] = useState('')
  const { signedIn, emailChanged } = useAuth()
  const asked = useRef(false)

  useEffect(() => {
    // Once: StrictMode runs effects twice in development, and the second use of a link answers "already used".
    if (!token || asked.current) return
    asked.current = true
    api.confirmEmailChange(token)
      .then((res) => {
        emailChanged(res.email)
        setEmail(res.email)
        setState('changed')
      })
      .catch(() => setState('failed'))
  }, [token, emailChanged])

  const next = signedIn ? '/account/security' : '/login'
  return (
    <>
      <Seo title={t('Confirm your new email')} noindex />
      <div className="wrap flex justify-center py-16">
        <div className="w-full max-w-sm text-center" role="status">
          {state === 'checking' && <Skeleton className="mx-auto h-8 w-2/3" />}
          {state === 'changed' && (
            <>
              <h1 className="text-display-md">{t('Email changed')}</h1>
              <p className="mt-4 text-[15px] text-muted">{t('From now on you sign in with {email}.', { email })}</p>
              <Button to={next} size="lg" className="mt-8">{signedIn ? t('Go to your account') : t('Sign in')}</Button>
            </>
          )}
          {state === 'failed' && (
            <>
              <h1 className="text-display-md">{t('This link did not work')}</h1>
              <p className="mt-4 text-[15px] text-muted">{t('It may have expired, or the change was already made. You can ask for a new link from your account.')}</p>
              <Button to={next} size="lg" className="mt-8">{signedIn ? t('Go to your account') : t('Sign in')}</Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
