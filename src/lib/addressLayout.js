/**
 * How a country writes an address, from `GET /countries/:code`: its fields in order, the words for them, and whether a
 * postcode is asked for at all.
 *
 * Kuwait has no postcodes, Japan puts the postcode first, the UK has counties and India PIN codes. Without an answer
 * from the backend (the demo has no layouts, or the call failed) the form stays as it always was: a required
 * postcode, "State / region".
 */
import { mark, t } from '../i18n/index.js'

const FALLBACK_ORDER = ['line1', 'line2', 'city', 'region', 'postalCode', 'country']
const FALLBACK_LABELS = { region: mark('State / region'), postalCode: mark('Postcode') }
/** The words the backend sends for other countries' fields, so the catalogs carry them; shown with `t()`. */
export const ADDRESS_LABEL_WORDS = [mark('State'), mark('Province'), mark('County'), mark('Prefecture'), mark('Emirate'), mark('Canton'), mark('Region'), mark('ZIP code'), mark('PIN code'), mark('Postal code'), mark('CEP'), mark('Eircode')]
/** The fields that sit side by side in a form; the street lines always come first, full width. */
const SHORT_FIELDS = ['city', 'region', 'postalCode', 'country']

export function addressLayout(details) {
  const order = Array.isArray(details?.fields) ? details.fields : FALLBACK_ORDER
  const zipRequired = details?.zipRequired
  // A layout without a postcode gets no postcode box, unless the country still requires one.
  const showPostcode = order.includes('postalCode') || zipRequired === true
  const short = order.filter((field) => SHORT_FIELDS.includes(field))
  if (showPostcode && !short.includes('postalCode')) {
    const at = short.indexOf('country')
    short.splice(at < 0 ? short.length : at, 0, 'postalCode')
  }
  // A form cannot do without these, whatever a custom layout leaves out.
  if (!short.includes('city')) short.unshift('city')
  if (!short.includes('country')) short.push('country')
  return {
    labels: { ...FALLBACK_LABELS, ...(details?.labels || {}) },
    short,
    showPostcode,
    postcodeRequired: showPostcode && zipRequired !== false,
  }
}

/** "Postcode", or "PIN code (optional)" where the country does not require one. */
export const postcodeLabel = (layout) =>
  layout.postcodeRequired ? t(layout.labels.postalCode) : t('{label} (optional)', { label: t(layout.labels.postalCode) })
