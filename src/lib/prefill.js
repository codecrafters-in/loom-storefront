/** The checkout fields a saved address fills in. */
export const ADDRESS_FIELDS = ['name', 'line1', 'line2', 'city', 'region', 'postalCode', 'country', 'phone']

/** The address checkout should start with: the default one, else the first saved. */
export const defaultAddressOf = (customer) => {
  const shipping = (customer?.addresses || []).filter((a) => a.type !== 'billing')
  return shipping.find((a) => a.isDefault) || shipping[0] || null
}

/**
 * The checkout form, filled from the signed-in customer.
 *
 * A refreshed checkout renders before the account has loaded, so the form
 * starts empty and has to be filled when the customer arrives. Whatever the
 * shopper has already typed wins: the email is filled only while it is empty
 * and untouched, and the address only while no address field has been touched.
 */
export function prefillCheckout(form, customer, touched = new Set()) {
  if (!customer) return form
  const next = { ...form }
  if (!touched.has('email') && !form.email) next.email = customer.email || ''
  const address = defaultAddressOf(customer)
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
