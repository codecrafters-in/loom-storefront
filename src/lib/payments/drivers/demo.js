import { ApiError } from '../../api/contracts.js'
import { mark, t } from '../../../i18n/index.js'

/**
 * The backend's test gateway (Odoo's "Demo" provider, and the bundled mock).
 *
 * No real card exists here, so the page asks for a test number and what the
 * payment should do, and the backend simulates exactly that. Only the last four
 * digits are sent: even a test form should not teach the habit of posting card
 * numbers to a store's API.
 */
export const OUTCOMES = [
  ['done', mark('Payment succeeds')],
  ['pending', mark('Payment stays pending')],
  ['cancel', mark('Shopper cancels')],
  ['error', mark('Card is declined')],
]

export function validateDemoCard(input) {
  const digits = String(input?.cardNumber || '').replace(/\D/g, '')
  if (digits.length < 12 || digits.length > 19) return t('Enter a test card number — any 12 to 19 digits.')
  if (!OUTCOMES.some(([key]) => key === input?.outcome)) return t('Choose what the test payment should do.')
  return null
}

export default {
  provider: 'demo',
  needsInput: true,
  validate: validateDemoCard,

  async run({ payment, api, input }) {
    const problem = validateDemoCard(input)
    if (problem) throw new ApiError(problem, { status: 422, code: 'invalid_card' })
    const digits = String(input.cardNumber).replace(/\D/g, '')
    return api.paymentAction(payment.id, 'simulate', { outcome: input.outcome, cardNumber: digits.slice(-4) })
  },
}
