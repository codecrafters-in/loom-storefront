import { useState } from 'react'
import api, { clearAll } from '../../lib/api/index.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { choosePricelist } from '../../lib/pricelist.js'
import { t } from '../../i18n/index.js'

/**
 * Currency switcher, for a live store whose Odoo website offers more than one currency (selectable pricelists).
 *
 * Picking one moves the bag to that pricelist (Odoo reprices it), remembers the choice for every later call, drops
 * the cached answers in the old currency and reloads: prices, the bag and the settings all come back in the new
 * currency from the backend. The theme never converts a price itself.
 */
export default function CurrencySwitcher({ className = '' }) {
  const config = useStorefront()
  const options = (config.pricing?.currencies || []).filter((entry) => entry.pricelistId)
  const [busy, setBusy] = useState(false)
  if (options.length < 2) return null

  const change = async (event) => {
    const entry = options.find((option) => option.code === event.target.value)
    if (!entry || entry.code === config.pricing.currency) return
    setBusy(true)
    choosePricelist(entry.pricelistId)
    try {
      await api.setCartPricelist(entry.pricelistId)
    } catch {
      /* no bag yet, or it is being paid for: the next bag starts in the new currency */
    }
    clearAll()
    window.location.reload()
  }

  return (
    <label className={`inline-flex items-center gap-1.5 text-[13px] ${className}`}>
      <span className="sr-only">{t('Currency')}</span>
      <select
        value={config.pricing.currency}
        onChange={change}
        disabled={busy}
        className="rounded-xs border border-line bg-transparent px-2 py-1 text-[13px]"
        aria-label={t('Currency')}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.code}{option.symbol && option.symbol !== option.code ? ` ${option.symbol}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
