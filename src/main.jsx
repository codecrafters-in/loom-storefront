import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { languageFromPath, setLanguage } from './i18n/index.js'
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

setLanguage(language || rendered, { address: Boolean(language) }).finally(() => {
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
