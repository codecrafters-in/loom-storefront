import { useState } from 'react'
import { Link } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import { Button } from '../components/ui/index.jsx'
import { useCaptcha } from '../components/Captcha.jsx'
import { withCaptcha } from '../lib/captcha.js'
import { t } from '../i18n/index.js'

/** "Forgot your password?": a reset link by email. The page says the same whether or not the address has an account. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)
  const captcha = useCaptcha('reset')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.forgotPassword(withCaptcha({ email }, await captcha.getToken()))
      setSent(true)
    } catch (err) {
      captcha.reset()
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title={t('Reset your password')} noindex />
      <div className="wrap flex justify-center py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-display-md">{t('Reset your password')}</h1>
          {sent ? (
            <p role="status" className="mt-6 text-[15px] leading-relaxed text-muted">
              {t('If an account uses {email}, a link to choose a new password is on its way. It works for a few hours.', { email })}
            </p>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <p className="text-[14px] text-muted">{t('Enter the email you signed up with and we will send you a link.')}</p>
              <div>
                <label htmlFor="reset-email" className="mb-1.5 block text-[13px] font-medium">{t('Email')}</label>
                <input id="reset-email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              {captcha.widget}
              {error && <p className="text-[13px] text-sale">{error.message}</p>}
              <Button as="button" type="submit" size="lg" full disabled={busy}>
                {busy ? t('Just a moment…') : t('Send the link')}
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-[13px] text-muted">
            <Link to="/login" className="link-underline text-ink">{t('Back to sign in')}</Link>
          </p>
        </div>
      </div>
    </>
  )
}
