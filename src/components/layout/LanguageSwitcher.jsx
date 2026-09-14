import { useLocation } from 'react-router-dom'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { CATALOGS, currentLanguage, t } from '../../i18n/index.js'

/**
 * Language switcher, for a store whose Odoo website has more than one language the storefront has text for.
 *
 * Each language is its own address (`/fr/shop`; the store's default language has none), so switching loads that
 * address: its catalog loads first and every call asks the backend for that language.
 */
export default function LanguageSwitcher({ className = '' }) {
  const config = useStorefront()
  const { pathname, search } = useLocation()
  const languages = (config.i18n?.languages || []).filter((language) => language.urlCode === 'en' || CATALOGS.includes(language.urlCode))
  if (languages.length < 2) return null
  const storeDefault = config.i18n?.default || 'en'

  const change = (event) => {
    const code = event.target.value
    const prefix = code === storeDefault ? '' : `/${code}`
    window.location.assign(`${prefix}${pathname}${search}`)
  }

  return (
    <select
      value={currentLanguage()}
      onChange={change}
      aria-label={t('Language')}
      className={`rounded-xs border border-line bg-transparent px-2 py-1 text-[13px] ${className}`}
    >
      {languages.map((language) => (
        <option key={language.urlCode} value={language.urlCode}>{language.name}</option>
      ))}
    </select>
  )
}
