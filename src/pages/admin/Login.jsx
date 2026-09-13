import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Icon } from '../../components/ui/index.jsx'
import { LoomMark } from '../../components/ui/Logo.jsx'
import { useAdminAuth } from '../../store/AdminAuthContext.jsx'

/** Errors after which the server wants the authenticator code as well. */
const NEEDS_CODE = new Set(['totp_required', 'invalid_totp'])

export default function AdminLogin() {
  const { signIn, signedIn, demo } = useAdminAuth()
  const [form, setForm] = useState({ username: '', password: '', totp: '' })
  const [askCode, setAskCode] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const { state } = useLocation()

  if (signedIn) return <Navigate to={state?.from || '/admin'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(form)
      navigate(state?.from || '/admin', { replace: true })
    } catch (err) {
      if (NEEDS_CODE.has(err.code)) setAskCode(true)
      setError(err.message)
      setBusy(false)
    }
  }

  const field = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-sunken/40 px-5">
      <div className="w-full max-w-sm">
        <div className="rounded-xs border border-line bg-surface p-8">
          <LoomMark size={30} />
          <h1 className="mt-5 font-display text-2xl">Admin</h1>
          <p className="mt-2 text-[13px] text-muted">
            {demo ? 'Sign in to manage the catalogue.' : 'Sign in with your Odoo account to manage the catalogue.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="u" className="mb-1.5 block text-[13px] font-medium">{demo ? 'Username' : 'Odoo login'}</label>
              <input id="u" required autoFocus autoComplete="username" className="field"
                value={form.username} onChange={field('username')} />
            </div>
            <div>
              <label htmlFor="p" className="mb-1.5 block text-[13px] font-medium">Password</label>
              <input id="p" type="password" required autoComplete="current-password" className="field"
                value={form.password} onChange={field('password')} />
            </div>
            {askCode && (
              <div>
                <label htmlFor="t" className="mb-1.5 block text-[13px] font-medium">Authenticator code</label>
                <input id="t" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  pattern="[0-9]{6}" className="field tracking-[0.3em]"
                  value={form.totp} onChange={field('totp')} />
              </div>
            )}
            {error && <p className="text-[13px] text-sale">{error}</p>}
            <Button as="button" type="submit" full size="lg" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        {demo && (
          <div className="mt-4 rounded-xs border border-line bg-surface p-4">
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0 text-accent" />
              <span>
                Demo credential — <code className="rounded-xs bg-sunken px-1.5 py-0.5 font-mono">{demo.username}</code>
                {' / '}
                <code className="rounded-xs bg-sunken px-1.5 py-0.5 font-mono">{demo.password}</code>.
                This gates a browser-local demo. Real protection is your server refusing
                unauthenticated <code className="font-mono">/admin/*</code> requests — the guard here
                only hides the interface.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
