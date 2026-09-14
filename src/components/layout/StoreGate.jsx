import { useState } from 'react'
import api from '../../lib/api/index.js'
import { saveAccess } from '../../lib/access.js'
import { Button } from '../ui/index.jsx'
import Logo from '../ui/Logo.jsx'
import Seo from '../Seo.jsx'
import { useAdminAuth } from '../../store/AdminAuthContext.jsx'

/**
 * What a shopper sees instead of the shop when there is no shop to show: the
 * backend cannot be reached, the store is in maintenance, or it is behind a
 * pre-launch password. Never the demo catalogue.
 */
function Shell({ config, children }) {
  return (
    <main id="main" className="grid min-h-[100dvh] place-items-center bg-page px-6 py-16">
      <div className="w-full max-w-md text-center">
        {config?.store?.name && <div className="flex justify-center"><Logo config={config} /></div>}
        {children}
      </div>
    </main>
  )
}

export function StoreUnavailable({ config, onRetry }) {
  return (
    <Shell config={config}>
      <Seo title="Store unavailable" noindex />
      <h1 className="mt-8 text-display-md">This store is unavailable right now</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">Please try again in a few minutes.</p>
      <Button className="mt-8" onClick={onRetry}>Try again</Button>
    </Shell>
  )
}

export function ClosedStore({ config, onUnlocked }) {
  const { signedIn } = useAdminAuth()
  const access = config?.access || {}
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const unlock = async (request) => {
    setBusy(true)
    setError('')
    try {
      saveAccess(await request())
      onUnlocked()
    } catch (err) {
      setError(err.message || 'That did not work. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const preview = signedIn && (
    <Button variant="outline" className="mt-6" disabled={busy} onClick={() => unlock(() => api.adminAccess())}>
      Preview as admin
    </Button>
  )
  const alert = error && <p role="alert" className="mt-4 text-[14px] text-sale">{error}</p>

  if (access.mode === 'maintenance') {
    return (
      <Shell config={config}>
        <Seo title="Back soon" noindex />
        <h1 className="mt-8 text-display-md">We will be back soon</h1>
        {access.message && <p className="mt-4 text-[15px] leading-relaxed text-muted">{access.message}</p>}
        {alert}
        {preview}
      </Shell>
    )
  }

  return (
    <Shell config={config}>
      <Seo title="Password required" noindex />
      <h1 className="mt-8 text-display-md">This store is opening soon</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">Enter the store password to continue.</p>
      <form
        className="mt-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          unlock(() => api.requestAccess(password))
        }}
      >
        <label htmlFor="store-password" className="sr-only">Store password</label>
        <input
          id="store-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
        <Button type="submit" disabled={busy} className="shrink-0">{busy ? '…' : 'Enter'}</Button>
      </form>
      {alert}
      {preview}
    </Shell>
  )
}

export default function StoreGate({ kind, config, onRetry, onUnlocked }) {
  return kind === 'unavailable'
    ? <StoreUnavailable config={config} onRetry={onRetry} />
    : <ClosedStore config={config} onUnlocked={onUnlocked} />
}
