import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/AuthContext.jsx'
import { Button, Icon } from '../components/ui/index.jsx'
import { isMock } from '../lib/api/index.js'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password })
      else await register(form)
      navigate(state?.from || '/account', { replace: true })
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="wrap flex justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-display-md">{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <p className="mt-3 text-[14px] text-muted">
          {mode === 'login' ? 'Orders, addresses and saved items in one place.' : 'It takes about twenty seconds.'}
        </p>

        {isMock && (
          <p className="mt-6 flex items-start gap-2.5 rounded-xs border border-line bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
            <Icon name="info" size={15} className="mt-px shrink-0 text-accent" />
            <span>Demo mode — any email and a password of six or more characters will sign you in.</span>
          </p>
        )}

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === 'register' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="mb-1.5 block text-[13px] font-medium">First name</label>
                <input id="firstName" className="field" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
              </div>
              <div>
                <label htmlFor="lastName" className="mb-1.5 block text-[13px] font-medium">Last name</label>
                <input id="lastName" className="field" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">Email</label>
            <input id="email" type="email" required className="field" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">Password</label>
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

          {error && <p className="text-[13px] text-sale">{error.message}</p>}

          <Button as="button" type="submit" size="lg" full disabled={busy}>
            {busy ? 'Just a moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-muted">
          {mode === 'login' ? 'No account yet?' : 'Already have one?'}{' '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            className="link-underline text-ink"
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>
        <p className="mt-2 text-center text-[13px]">
          <Link to="/shop" className="text-faint link-underline">Keep shopping instead</Link>
        </p>
      </div>
    </div>
  )
}
