import { useState } from 'react'
import api from '../lib/api/index.js'
import { useToast } from '../store/ToastContext.jsx'
import { useCaptcha } from '../components/Captcha.jsx'
import { t } from '../i18n/index.js'

/**
 * A newsletter sign-up form: the footer's, and the home page's `newsletter` section. One place for the call, the
 * captcha and the messages, so the two forms cannot drift apart.
 *
 * `source` tells the backend which form it was (`footer`, `home`). The captcha waits for the first focus
 * (`captcha.activate`): the footer is on every page, and a captcha script on every page is a cost every shopper pays
 * for one small form.
 */
export default function useNewsletter(source) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const { push } = useToast()
  const captcha = useCaptcha('newsletter', { defer: true })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const captchaToken = await captcha.getToken()
      const res = await api.subscribe(email, { captchaToken, source, consent: t('Newsletter') })
      setEmail('')
      push(res?.status === 'confirmed' ? t('You are already subscribed. Thank you!') : t('Thanks — check your inbox to confirm.'))
    } catch (err) {
      push(err.message || t('Could not subscribe.'), { tone: 'error' })
    } finally {
      // Single-use, and the form stays on screen for another address.
      captcha.reset()
      setBusy(false)
    }
  }

  return { email, setEmail, busy, submit, captcha }
}
