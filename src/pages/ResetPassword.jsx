import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import { useAuth } from '../store/AuthContext.jsx'
import { useCart } from '../store/CartContext.jsx'
import { Button } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'

const MIN_LENGTH = 8

/**
 * A new password from an emailed link: `/reset-password?token=` (a forgotten password) or `/create-account?token=`
 * (an invitation from the store). Either way the shopper ends up signed in.
 */
export default function ResetPassword({ invitation = false }) {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { resetPassword, signupWithToken } = useAuth()
  const { refresh } = useCart()
  const navigate = useNavigate()
  const title = invitation ? t('Create your account') : t('Choose a new password')

  const submit = async (event) => {
    event.preventDefault()
    if (password !== confirm) {
      setError({ message: t('The two passwords are not the same.') })
      return
    }
    setBusy(true)
    setError(null)
    try {
      await (invitation ? signupWithToken : resetPassword)({ token, password })
      await refresh().catch(() => {})
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title={title} noindex />
      <div className="wrap flex justify-center py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-display-md">{title}</h1>
          {!token ? (
            <p className="mt-6 text-[15px] text-muted">
              {t('This link is incomplete.')} <Link to="/forgot-password" className="link-underline text-ink">{t('Ask for a new one')}</Link>
            </p>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-[13px] font-medium">{t('New password')}</label>
                <input id="new-password" type="password" required minLength={MIN_LENGTH} className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <p className="mt-1.5 text-[12px] text-faint">{t('At least {count} characters.', { count: MIN_LENGTH })}</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-[13px] font-medium">{t('Repeat the password')}</label>
                <input id="confirm-password" type="password" required minLength={MIN_LENGTH} className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              {error && (
                <p className="text-[13px] text-sale">
                  {error.message}{' '}
                  {error.code === 'invalid_token' && <Link to="/forgot-password" className="link-underline">{t('Ask for a new one')}</Link>}
                </p>
              )}
              <Button as="button" type="submit" size="lg" full disabled={busy}>
                {busy ? t('Just a moment…') : invitation ? t('Create account') : t('Save and sign in')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
