import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import { useAuth } from '../store/AuthContext.jsx'
import { useCart } from '../store/CartContext.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import { Button, Skeleton } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'

// Where the sign-in page keeps the state it expects a provider to hand back (the same key in Login.jsx).
const OAUTH_KEY = 'loom.oauth'

/**
 * Where a sign-in provider sends the shopper back: `/login/oauth#access_token=…&state=…`.
 *
 * The state must be the one this browser started with (kept by the sign-in page), so a link someone else started
 * cannot sign a visitor in to the wrong account. The token leaves the address bar before anything else happens.
 */
export default function OAuthReturn() {
  const { finishOAuth } = useAuth()
  const { refresh } = useCart()
  const wishlist = useWishlist()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.hash.slice(1))
    window.history.replaceState(window.history.state, '', window.location.pathname)
    let saved = null
    try {
      saved = JSON.parse(sessionStorage.getItem(OAUTH_KEY) || 'null')
      sessionStorage.removeItem(OAUTH_KEY)
    } catch {
      /* storage unavailable: treated as a sign-in started elsewhere */
    }
    const state = params.get('state')
    const accessToken = params.get('access_token')
    if (params.get('error')) {
      setError(t('Signing in was cancelled.'))
      return
    }
    if (!accessToken || !state || state !== saved?.state) {
      setError(t('This sign-in did not start in this browser. Please try again.'))
      return
    }
    finishOAuth({ state, accessToken })
      .then(async () => {
        await Promise.all([refresh().catch(() => {}), wishlist.reload()])
        navigate(saved.from || '/account', { replace: true })
      })
      .catch((err) => setError(err.message))
  }, [finishOAuth, refresh, wishlist, navigate])

  return (
    <>
      <Seo title={t('Sign in')} noindex />
      <div className="wrap flex justify-center py-16">
        <div className="w-full max-w-sm text-center" role="status">
          {error ? (
            <>
              <h1 className="text-display-md">{t('Signing in did not work')}</h1>
              <p className="mt-4 text-[15px] text-muted">{error}</p>
              <Button to="/login" size="lg" className="mt-8">{t('Back to sign in')}</Button>
            </>
          ) : (
            <>
              <p className="text-[15px] text-muted">{t('Signing you in…')}</p>
              <Skeleton className="mx-auto mt-6 h-8 w-2/3" />
            </>
          )}
        </div>
      </div>
    </>
  )
}
