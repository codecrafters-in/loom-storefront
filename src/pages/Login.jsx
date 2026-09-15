import { useState } from 'react'
import { useStorefront } from '../store/StorefrontContext.jsx'
import Seo from '../components/Seo.jsx'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { useCart } from '../store/CartContext.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import { Button, Icon } from '../components/ui/index.jsx'
import api, { isMock } from '../lib/api/index.js'
import { useCaptcha } from '../components/Captcha.jsx'
import { withCaptcha } from '../lib/captcha.js'
import { t } from '../i18n/index.js'

// Where the sign-in page keeps the state it expects a provider to hand back (the same key in OAuthReturn.jsx).
const OAUTH_KEY = 'loom.oauth'

export default function Login() {
  // Checkout and the order page send shoppers here with where to return, and the order page with an email to register.
  const { state } = useLocation()
  const [mode, setMode] = useState(state?.mode === 'register' ? 'register' : 'login')
  const [form, setForm] = useState({ email: state?.email || '', password: '', firstName: '', lastName: '', company: '', vat: '' })
  const [business, setBusiness] = useState(false)
  const [news, setNews] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { login, register, verifyLoginCode } = useAuth()
  const { refresh } = useCart()
  const wishlist = useWishlist()
  const navigate = useNavigate()
  // The modes are named like the captcha actions, so the check follows the form (a code by text message asks as sign-in).
  const captcha = useCaptcha(mode === 'register' ? 'register' : 'login')
  const features = useStorefront().features || {}
  // Only a store whose website lets anyone sign up offers it; an invitation-only store signs in only.
  const signup = features.signup !== false
  const phoneLogin = features.phoneLogin === true
  const providers = Array.isArray(features.socialLogin) ? features.socialLogin : []
  const [code, setCode] = useState({ phone: '', code: '', sent: false })

  // Signing in merges the guest bag and saved items into the account's: show the merged ones now, not after a reload.
  const finish = async () => {
    await Promise.all([refresh().catch(() => {}), wishlist.reload()])
    navigate(state?.from || '/account', { replace: true })
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // A provider's page, then back to /login/oauth with the state kept here to compare.
  const social = async (provider) => {
    setBusy(true)
    setError(null)
    try {
      const started = await api.startOAuth(provider.id)
      try {
        sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ state: started.state, from: state?.from }))
      } catch {
        /* the return page then asks to try again */
      }
      window.location.assign(started.url)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'phone' && code.sent) {
        await verifyLoginCode({ phone: code.phone, code: code.code })
      } else if (mode === 'phone') {
        await api.requestLoginCode(withCaptcha({ phone: code.phone }, await captcha.getToken()))
        captcha.reset()
        setCode((c) => ({ ...c, sent: true }))
        setBusy(false)
        return
      } else {
        const captchaToken = await captcha.getToken()
        if (mode === 'login') await login(withCaptcha({ email: form.email, password: form.password }, captchaToken))
        else {
        const details = business ? form : { ...form, company: undefined, vat: undefined }
        const consent = news ? { newsletter: true, newsletterConsent: t('Email me news and offers') } : {}
        await register(withCaptcha({ ...details, ...consent }, captchaToken))
      }
      }
      await finish()
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
        <h1 className="text-display-md">{mode === 'register' ? t('Create an account') : t('Sign in')}</h1>
        <p className="mt-3 text-[14px] text-muted">
          {mode === 'register'
            ? t('It takes about twenty seconds.')
            : mode === 'phone'
              ? t('We text a six-digit code to the phone number on your account.')
              : t('Orders, addresses and saved items in one place.')}
        </p>

        {isMock && (
          <p className="mt-6 flex items-start gap-2.5 rounded-xs border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
            <Icon name="info" size={15} className="mt-px shrink-0 text-accent" />
            <span>{t('Demo mode — any email and a password of six or more characters will sign you in.')}</span>
          </p>
        )}

        {mode === 'phone' ? (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium">{t('Phone number')}</label>
              <input
                id="phone" type="tel" required className="field" value={code.phone} autoComplete="tel" disabled={code.sent}
                placeholder="+1 415 555 0199" onChange={(e) => setCode((c) => ({ ...c, phone: e.target.value }))}
              />
            </div>
            {code.sent && (
              <div>
                <label htmlFor="code" className="mb-1.5 block text-[13px] font-medium">{t('Code')}</label>
                <input
                  id="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus
                  className="field tracking-[0.3em]" value={code.code} onChange={(e) => setCode((c) => ({ ...c, code: e.target.value.replace(/\D/g, '') }))}
                />
                <p className="mt-1.5 text-[12px] text-faint">{t('If an account uses this number, the code is on its way. It works for 5 minutes.')}</p>
              </div>
            )}
            {!code.sent && captcha.widget}
            {error && <p className="text-[13px] text-sale">{error.message}</p>}
            <Button as="button" type="submit" size="lg" full disabled={busy}>
              {busy ? t('Just a moment…') : code.sent ? t('Sign in') : t('Text me a code')}
            </Button>
            {code.sent && (
              <button type="button" className="link-underline text-[13px] text-muted" onClick={() => { setCode({ phone: code.phone, code: '', sent: false }); setError(null) }}>
                {t('Use a different number or send again')}
              </button>
            )}
          </form>
        ) : (
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
              minLength={mode === 'register' ? 8 : undefined}
              className="field"
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'login' && (
            <p className="-mt-2 text-end text-[13px]">
              <Link to="/forgot-password" className="link-underline text-muted">{t('Forgot your password?')}</Link>
            </p>
          )}
          {mode === 'register' && <p className="-mt-2 text-[12px] text-faint">{t('At least {count} characters.', { count: 8 })}</p>}
          {mode === 'register' && (
            <label className="flex items-center gap-2.5 text-[14px]">
              <input type="checkbox" checked={business} onChange={(e) => setBusiness(e.target.checked)} />
              {t('Buying for a business?')}
            </label>
          )}
          {mode === 'register' && features.newsletter !== false && (
            <label className="flex items-center gap-2.5 text-[14px]">
              <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
              {t('Email me news and offers')}
            </label>
          )}
          {mode === 'register' && business && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="company" className="mb-1.5 block text-[13px] font-medium">{t('Company (optional)')}</label>
                <input id="company" className="field" value={form.company} onChange={set('company')} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="vat" className="mb-1.5 block text-[13px] font-medium">{t('Tax ID (optional)')}</label>
                <input id="vat" className="field" value={form.vat} onChange={set('vat')} />
              </div>
            </div>
          )}

          {captcha.widget}
          {error && <p className="text-[13px] text-sale">{error.message}</p>}

          <Button as="button" type="submit" size="lg" full disabled={busy}>
            {busy ? t('Just a moment…') : mode === 'login' ? t('Sign in') : t('Create account')}
          </Button>
        </form>
        )}

        {providers.length > 0 && mode !== 'phone' && (
          <div className="mt-6 space-y-2.5">
            <p className="text-center text-[12px] text-faint">{t('or')}</p>
            {providers.map((provider) => (
              <Button key={provider.id} variant="quiet" size="lg" full disabled={busy} onClick={() => social(provider)}>
                {provider.label || provider.name}
              </Button>
            ))}
          </div>
        )}

        {phoneLogin && mode !== 'register' && (
          <p className="mt-4 text-center text-[13px]">
            <button type="button" className="link-underline text-muted" onClick={() => { setMode(mode === 'phone' ? 'login' : 'phone'); setError(null) }}>
              {mode === 'phone' ? t('Sign in with your email and password') : t('Sign in with a code by text message')}
            </button>
          </p>
        )}

        {mode !== 'phone' && (signup || mode === 'register') && (
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
        )}
        <p className="mt-2 text-center text-[13px]">
          <Link to="/shop" className="text-faint link-underline">{t('Keep shopping instead')}</Link>
        </p>
      </div>
      </div>
    </>
  )
}
