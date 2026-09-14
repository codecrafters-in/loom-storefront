import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { languageFromPath, setLanguage } from './i18n/index.js'
import './index.css'

// `/fr/...` is the storefront in French: its catalog loads before the first render, and the router works below the prefix.
const language = languageFromPath(window.location.pathname)

setLanguage(language, { address: Boolean(language) }).finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {/* React Router v7 behaviour, opted into now so the upgrade changes nothing. */}
      <BrowserRouter basename={language ? `/${language}` : undefined} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
})
