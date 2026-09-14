import { useState } from 'react'
import Seo from '../components/Seo.jsx'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { useCart } from '../store/CartContext.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import { Button, Icon } from '../components/ui/index.jsx'
import { isMock } from '../lib/api/index.js'
import { useCaptcha } from '../components/Captcha.jsx'
import { withCaptcha } from '../lib/captcha.js'
import { t } from '../i18n/index.js'

export default function Login() {
  // Checkout and the order page send shoppers here with where to return, and the order page with an email to register.
  const { state } = useLocation()
  const [mode, setMode] = useState(state?.mode === 'register' ? 'register' : 'login')
  const [form, setForm] = useState({ email: state?.email || '', password: '', firstName: '', lastName: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { login, register } = useAuth()
  const { refresh } = useCart()
  const wishlist = useWishlist()
  const navigate = useNavigate()
  // The modes are named like the captcha actions, so the check follows the form.
  const captcha = useCaptcha(mode)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const captchaToken = await captcha.getToken()
      if (mode === 'login') await login(withCaptcha({ email: form.email, password: form.password }, captchaToken))
      else await register(withCaptcha(form, captchaToken))
      // Signing in merges the guest bag and saved items into the account's: show the merged ones now, not after a reload.
      await Promise.all([refresh().catch(() => {}), wishlist.reload()])
      navigate(state?.from || '/account', { replace: true })
    } catch (err) {
      // The token was spent on the attempt, right or wrong.
      captcha.reset()
      setError(err)
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title={t('Sign in')} noindex />
      <div className="wrap flex justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-display-md">{mode === 'login' ? t('Sign in') : t('Create an account')}</h1>
        <p className="mt-3 text-[14px] text-muted">
          {mode === 'login' ? t('Orders, addresses and saved items in one place.') : t('It takes about twenty seconds.')}
        </p>

        {isMock && (
          <p className="mt-6 flex items-start gap-2.5 rounded-xs border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
            <Icon name="info" size={15} className="mt-px shrink-0 text-accent" />
            <span>{t('Demo mode — any email and a password of six or more characters will sign you in.')}</span>
          </p>
        )}

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === 'register' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="mb-1.5 block text-[13px] font-medium">{t('First name')}</label>
                <input id="firstName" className="field" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
              </div>
              <div>
                <label htmlFor="lastName" className="mb-1.5 block text-[13px] font-medium">{t('Last name')}</label>
                <input id="lastName" className="field" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">{t('Email')}</label>
            <input id="email" type="email" required className="field" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">{t('Password')}</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              className="field"
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {captcha.widget}
          {error && <p className="text-[13px] text-sale">{error.message}</p>}

          <Button as="button" type="submit" size="lg" full disabled={busy}>
            {busy ? t('Just a moment…') : mode === 'login' ? t('Sign in') : t('Create account')}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-muted">
          {mode === 'login' ? t('No account yet?') : t('Already have one?')}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            className="link-underline text-ink"
          >
            {mode === 'login' ? t('Create one') : t('Sign in')}
          </button>
        </p>
        <p className="mt-2 text-center text-[13px]">
          <Link to="/shop" className="text-faint link-underline">{t('Keep shopping instead')}</Link>
        </p>
      </div>
      </div>
    </>
  )
}
