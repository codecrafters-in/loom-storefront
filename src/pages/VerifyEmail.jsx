import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import { useAuth } from '../store/AuthContext.jsx'
import { Button, Skeleton } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'

/** The link in the "confirm your email" message (`/verify-email?token=`). */
export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState(token ? 'checking' : 'failed')
  const { signedIn, markVerified } = useAuth()
  const asked = useRef(false)

  useEffect(() => {
    // Once: StrictMode runs effects twice in development, and a token used twice would answer "expired" the second time.
    if (!token || asked.current) return
    asked.current = true
    api.verifyEmail(token)
      .then(() => {
        markVerified()
        setState('verified')
      })
      .catch(() => setState('failed'))
  }, [token, markVerified])

  return (
    <>
      <Seo title={t('Confirm your email')} noindex />
      <div className="wrap flex justify-center py-16">
        <div className="w-full max-w-sm text-center" role="status">
          {state === 'checking' && <Skeleton className="mx-auto h-8 w-2/3" />}
          {state === 'verified' && (
            <>
              <h1 className="text-display-md">{t('Email confirmed')}</h1>
              <p className="mt-4 text-[15px] text-muted">{t('Thank you. Orders you placed with this email now show in your account.')}</p>
              <Button to={signedIn ? '/account' : '/login'} size="lg" className="mt-8">{signedIn ? t('Go to your account') : t('Sign in')}</Button>
            </>
          )}
          {state === 'failed' && (
            <>
              <h1 className="text-display-md">{t('This link did not work')}</h1>
              <p className="mt-4 text-[15px] text-muted">{t('It may have expired. Sign in and send a new one from your account.')}</p>
              <Button to={signedIn ? '/account' : '/login'} size="lg" className="mt-8">{signedIn ? t('Go to your account') : t('Sign in')}</Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
