import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { addressLayout } from '../../lib/addressLayout.js'

/** The address layout of `country` (see lib/addressLayout.js), from the same cached call the state field makes. */
export default function useAddressLayout(country) {
  const code = String(country || '').toUpperCase()
  const { data } = useAsync(() => (code ? api.getCountry(code).catch(() => null) : Promise.resolve(null)), [code])
  // Ignore the previous country's answer while the new one loads.
  return addressLayout(data?.code === code ? data : null)
}
