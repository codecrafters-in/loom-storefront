import { useState } from 'react'
import api from '../../lib/api/index.js'
import { useAuth } from '../../store/AuthContext.jsx'
import { useCaptcha } from '../Captcha.jsx'
import { withCaptcha } from '../../lib/captcha.js'
import { Button } from '../ui/index.jsx'
import { t } from '../../i18n/index.js'

/**
 * "Notify me" on a sold-out option (`features.stockAlerts`): one email when it is back in stock. A signed-in
 * customer is emailed at their account's address; a visitor types one.
 */
export default function NotifyMe({ product, variant }) {
  const { signedIn } = useAuth()
  const captcha = useCaptcha('alert', { defer: true })
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle')
  const [problem, setProblem] = useState(null)

  const send = async (e) => {
    e?.preventDefault()
    setState('busy')
    setProblem(null)
    try {
      const body = { kind: 'stock', variantId: variant?.id, ...(signedIn ? {} : { email }) }
      await api.createAlert(product.slug, withCaptcha(body, await captcha.getToken()))
      setState('done')
    } catch (err) {
      captcha.reset()
      setProblem(err.message)
      setState('idle')
    }
  }

  if (state === 'done') {
    return <p role="status" className="mt-3 text-[14px] text-good">{t('We will email you when it is back in stock.')}</p>
  }
  if (!open && !signedIn) {
    return (
      <Button variant="quiet" size="lg" full className="mt-3" onClick={() => setOpen(true)}>{t('Email me when it is back')}</Button>
    )
  }
  return (
    <form onSubmit={send} className="mt-3 space-y-3">
      {!signedIn && (
        <div>
          <label htmlFor="notify-email" className="mb-1.5 block text-[13px] font-medium">{t('Email')}</label>
          <input id="notify-email" type="email" required autoFocus className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
      )}
      {captcha.widget}
      {problem && <p className="text-[13px] text-sale">{problem}</p>}
      <Button as="button" type="submit" variant="quiet" size="lg" full disabled={state === 'busy'}>
        {state === 'busy' ? t('Just a moment…') : t('Email me when it is back')}
      </Button>
    </form>
  )
}
