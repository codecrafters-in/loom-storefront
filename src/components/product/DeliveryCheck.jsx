import { useState } from 'react'
import api from '../../lib/api/index.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { Button, Icon } from '../ui/index.jsx'

/**
 * "Does it come to me?" on the product page, before anything is in the bag: the backend checks the store's
 * delivery methods against the postcode and says when the fastest one arrives.
 */
export default function DeliveryCheck({ variantId }) {
  const config = useStorefront()
  const countries = config.commerce?.countries || []
  const locale = config.pricing?.locale || 'en-US'
  const localeCountry = locale.split('-')[1]
  const [country, setCountry] = useState(countries.find(([code]) => code === localeCountry)?.[0] || countries[0]?.[0] || '')
  const [postalCode, setPostalCode] = useState('')
  const [state, setState] = useState({ busy: false, result: null, error: null, asked: '' })

  const check = async (event) => {
    event.preventDefault()
    const asked = postalCode.trim()
    if (!asked || state.busy) return
    setState({ busy: true, result: null, error: null, asked })
    try {
      const result = await api.checkServiceability({ country, postalCode: asked, variantId })
      setState({ busy: false, result, error: null, asked })
    } catch (error) {
      setState({ busy: false, result: null, error, asked })
    }
  }

  const fastest = state.result?.methods?.[0]
  const date = fastest?.arrivesAt
    ? new Date(fastest.arrivesAt).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  return (
    <form onSubmit={check} className="mt-4 border-t border-line pt-4">
      <label htmlFor="delivery-postcode" className="mb-1.5 block text-[13px] font-medium">Check delivery to your postcode</label>
      <div className="flex gap-2">
        {countries.length > 1 && (
          <select aria-label="Country" className="field h-10 w-24 text-[13px]" value={country} onChange={(e) => setCountry(e.target.value)}>
            {countries.map(([code]) => <option key={code} value={code}>{code}</option>)}
          </select>
        )}
        <input
          id="delivery-postcode"
          className="field h-10 text-[13px]"
          autoComplete="postal-code"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
        />
        <Button as="button" type="submit" variant="quiet" size="sm" className="h-10 shrink-0" disabled={state.busy}>
          {state.busy ? 'Checking…' : 'Check'}
        </Button>
      </div>
      {state.result && (
        <p role="status" className="mt-2 flex items-start gap-2 text-[13px] leading-snug">
          <Icon name={state.result.deliverable ? 'truck' : 'info'} size={15} className="mt-px shrink-0 text-accent" />
          <span>
            {state.result.deliverable
              ? `Delivers to ${state.asked}${date ? ` by ${date}` : ''}${fastest ? ` with ${fastest.label}` : ''}.`
              : `We don’t deliver to ${state.asked} yet.`}
          </span>
        </p>
      )}
      {state.error && <p role="alert" className="mt-2 text-[13px] text-sale">{state.error.message}</p>}
    </form>
  )
}
