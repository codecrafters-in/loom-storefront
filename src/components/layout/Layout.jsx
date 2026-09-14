import { lazy, Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import Footer from './Footer.jsx'
import CartDrawer from '../cart/CartDrawer.jsx'
import DemoBar from '../DemoBar.jsx'
import CompareTray from '../product/CompareTray.jsx'
import { useStorefrontState } from '../../store/StorefrontContext.jsx'
import { t } from '../../i18n/index.js'

// Rarely shown, so not in every visitor's first download.
const StoreGate = lazy(() => import('./StoreGate.jsx'))
// Only for a store that asks for cookie consent.
const ConsentBanner = lazy(() => import('../consent/ConsentBanner.jsx'))

export default function Layout() {
  const { pathname } = useLocation()
  const state = useStorefrontState()

  // A route change should land you at the top of the new page, not halfway
  // down it where the previous one happened to be scrolled.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  if (state.unavailable || state.closed) {
    return (
      <Suspense fallback={null}>
        <StoreGate
          kind={state.unavailable ? 'unavailable' : 'closed'}
          config={state.config}
          onRetry={state.reload}
          onUnlocked={state.unlock}
        />
      </Suspense>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-xs focus:bg-ink focus:px-4 focus:py-2 focus:text-page"
      >
        {t('Skip to content')}
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <CompareTray />
      <DemoBar />
      {state.config.consent?.enabled && (
        <Suspense fallback={null}>
          <ConsentBanner consent={state.config.consent} />
        </Suspense>
      )}
    </div>
  )
}
