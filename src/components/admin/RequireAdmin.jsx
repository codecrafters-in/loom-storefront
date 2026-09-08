import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../store/AdminAuthContext.jsx'
import { Skeleton } from '../ui/index.jsx'

/**
 * Route guard for the back office.
 *
 * This hides the interface. It is not access control — the admin bundle is
 * downloadable by anyone who asks for the URL, and a determined visitor can set
 * the localStorage key by hand. **The only thing standing between the public
 * and your catalogue is your server rejecting unauthenticated `/admin/*`
 * requests.** Said here, at the guard, because the guard is exactly what makes
 * people believe otherwise.
 */
export default function RequireAdmin({ children }) {
  const { signedIn, ready } = useAdminAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-5 py-10">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!signedIn) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  return children
}
