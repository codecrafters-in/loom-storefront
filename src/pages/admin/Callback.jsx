import { useEffect } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Skeleton } from '../../components/ui/index.jsx'
import { useAdminAuth } from '../../store/AdminAuthContext.jsx'

/**
 * Where Odoo sends the browser back after sign-in.
 *
 * Outside the admin guard, because nobody is signed in yet when it loads. It
 * trades the one-time code for a session and leaves, replacing itself in the
 * history — Back from the admin must not land on a spent code, which would only
 * ever say "no longer valid".
 */
export default function AdminCallback() {
  const { completeSignIn, demo } = useAdminAuth()
  const navigate = useNavigate()
  const { search } = useLocation()

  useEffect(() => {
    if (demo) return undefined
    let alive = true
    completeSignIn(search).then((result) => {
      if (!alive) return
      if (result.ok) navigate(result.from, { replace: true })
      else navigate('/admin/login', { replace: true, state: { error: result.message, from: result.from } })
    })
    return () => {
      alive = false
    }
  }, [completeSignIn, demo, navigate, search])

  // The demo has no Odoo to come back from.
  if (demo) return <Navigate to="/admin/login" replace />

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-sunken/40 px-5">
      <div className="w-full max-w-sm rounded-xs border border-line bg-surface p-8">
        <p className="text-[13px] text-muted" role="status">Signing you in…</p>
        <Skeleton className="mt-5 h-10 w-full" />
      </div>
    </div>
  )
}
