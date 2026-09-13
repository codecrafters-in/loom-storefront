import { useEffect, useMemo } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'

const NO_STATES = []

/**
 * State / region for an address, following the selected country.
 *
 * When the backend lists the country's states (`GET /countries/:code`), this is
 * a dropdown of exactly the codes it validates against, so a typed "Gujrat" can
 * never be refused at checkout. A country without a list keeps a text box, and
 * so does any backend that does not answer the call.
 *
 * `onChange` receives the native change event, so it drops into the same
 * `set('region')` handler a plain input uses.
 */
export default function RegionField({ id, country, value, onChange, invalid = false, label = 'State / region' }) {
  const code = String(country || '').toUpperCase()
  const { data } = useAsync(
    () => (code ? api.getCountry(code).catch(() => null) : Promise.resolve(null)),
    [code],
  )
  // Ignore the previous country's answer while the new one loads.
  const details = data?.code === code ? data : null
  const states = useMemo(() => details?.states || NO_STATES, [details])
  const required = Boolean(details?.stateRequired && states.length)

  // A saved state may be a name ("Gujarat") rather than a code, or belong to the
  // country that was selected a moment ago. Settle it on the code, or clear it.
  useEffect(() => {
    if (!states.length || !value || states.some((s) => s.code === value)) return
    const typed = String(value).trim().toLowerCase()
    const match = states.find((s) => s.name.toLowerCase() === typed || s.code.toLowerCase() === typed)
    onChange({ target: { value: match ? match.code : '' } })
  }, [states, value, onChange])

  const className = `field ${invalid ? 'border-sale' : ''}`
  const optional = states.length && !required ? ' (optional)' : ''

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}{optional}</label>
      {states.length ? (
        <select
          id={id}
          className={className}
          value={states.some((s) => s.code === value) ? value : ''}
          onChange={onChange}
          required={required}
          aria-invalid={invalid || undefined}
          autoComplete="address-level1"
        >
          <option value="" disabled={required}>{required ? 'Select a state' : 'None'}</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      ) : (
        <input
          id={id}
          className={className}
          value={value || ''}
          onChange={onChange}
          aria-invalid={invalid || undefined}
          autoComplete="address-level1"
        />
      )}
    </div>
  )
}
