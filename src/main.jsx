import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { languageFromPath, setLanguage } from './i18n/index.js'
import { config } from './lib/config.js'
import { loadMoreSections, MARKER } from './components/home/load-more.js'
import './index.css'

// `/fr/...` is the storefront in French: its catalog loads before the first render, and the router works below the prefix.
const language = languageFromPath(window.location.pathname)
// Without one, the store's default language when the server rendered the page in it (an Arabic store at `/`).
const rendered = typeof window.__LOOM_LANG__ === 'string' ? window.__LOOM_LANG__ : ''
const root = document.getElementById('root')

// Campaign tags and ad click IDs of this visit (a small chunk of its own; the address is still the landing one).
import('./lib/attribution.js')
  .then((module) => module.captureVisit())
  .catch(() => {})

// Errors nothing caught, to Sentry, when the build has a DSN.
if (config.monitoring.sentryDsn) {
  import('./lib/monitoring.js')
    .then((module) => module.watchErrors())
    .catch(() => {})
}

// Web vitals of this page load, reported to analytics when the page is hidden. Loaded once the page is idle.
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500))
idle(() => {
  Promise.all([import('./lib/vitals.js'), import('./lib/analytics.js')])
    .then(([vitals, analytics]) => vitals.watchVitals(analytics.webVital))
    .catch(() => {})
})

// The offline shell, for a build that asks for it (VITE_PWA=on).
if (import.meta.env.VITE_PWA === 'on' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// A page with one of the newer home sections hydrates with their code already in, so the server's markup for them is
// adopted as it is (components/home/load-more.js). Hydrating without it still works, only later.
const sections = root.querySelector(`[${MARKER}]`) ? loadMoreSections().catch(() => {}) : null

Promise.all([setLanguage(language || rendered, { address: Boolean(language) }), sections]).finally(() => {
  const app = (
    <StrictMode>
      {/* React Router v7 behaviour, opted into now so the upgrade changes nothing. */}
      <BrowserRouter basename={language ? `/${language}` : undefined} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </StrictMode>
  )
  if (root.hasChildNodes()) {
    // The server already rendered this page with its data: adopt its markup instead of painting it again. A part that
    // differs (a date in another time zone) is re-rendered in the browser; shoppers need no console error for it.
    hydrateRoot(root, app, {
      onRecoverableError: (error) => {
        if (import.meta.env.DEV) console.warn('[hydrate]', error)
      },
    })
  } else {
    createRoot(root).render(app)
  }
})
