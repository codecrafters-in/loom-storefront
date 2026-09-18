/** The store's own country: the locale's (en-GB is GB) when the store delivers there, else the first it lists. */
export function storeCountry(config) {
  const countries = config?.commerce?.countries || []
  const own = (config?.pricing?.locale || '').split('-')[1]
  return countries.find(([code]) => code === own)?.[0] || countries[0]?.[0] || ''
}

/** The checkout fields a saved address fills in. */
export const ADDRESS_FIELDS = ['name', 'line1', 'line2', 'city', 'region', 'postalCode', 'country', 'phone']

/**
 * The address checkout should start with: the default one, else the first saved. With `countries` (the codes the
 * store delivers to), only an address in one of them: a saved address abroad would otherwise sit in the form under a
 * country the list cannot show.
 */
export const defaultAddressOf = (customer, countries = null) => {
  const shipping = (customer?.addresses || []).filter(
    (a) => a.type !== 'billing' && (!countries || countries.includes(String(a.country || '').toUpperCase())),
  )
  return shipping.find((a) => a.isDefault) || shipping[0] || null
}

/**
 * The checkout form, filled from the signed-in customer.
 *
 * A refreshed checkout renders before the account has loaded, so the form
 * starts empty and has to be filled when the customer arrives. Whatever the
 * shopper has already typed wins: the email is filled only while it is empty
 * and untouched, and the address only while no address field has been touched.
 * `countries` limits the address to the ones the store delivers to.
 */
export function prefillCheckout(form, customer, touched = new Set(), countries = null) {
  if (!customer) return form
  const next = { ...form }
  if (!touched.has('email') && !form.email) next.email = customer.email || ''
  const address = defaultAddressOf(customer, countries)
  if (address && !ADDRESS_FIELDS.some((field) => touched.has(field))) {
    for (const field of ADDRESS_FIELDS) {
      next[field] = address[field] || (field === 'country' ? form.country : '')
    }
  }
  return next
}

/**
 * The contact form's name and email, filled from the signed-in customer. What the shopper already typed wins, and a
 * customer with no name on the account leaves the name for them to write.
 */
export function prefillContact(form, customer) {
  if (!customer) return form
  const name = customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(' ')
  return { ...form, name: form.name || name || '', email: form.email || customer.email || '' }
}
