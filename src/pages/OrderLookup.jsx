import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api/index.js'
import Seo from '../components/Seo.jsx'
import { Button, ErrorState } from '../components/ui/index.jsx'
import { useAuth } from '../store/AuthContext.jsx'
import { useCaptcha } from '../components/Captcha.jsx'
import { withCaptcha } from '../lib/captcha.js'

/**
 * Find an order without an account.
 *
 * Guest checkout is the default here, and until now a guest order was reachable
 * only from the browser that placed it. Clear your history, or open the
 * confirmation email on a different phone, and the order was gone — so the
 * shopper emails support, or decides the order failed and orders again.
 *
 * Deliberately not indexed. There is nothing here for a search engine and a
 * form that takes an email address does not want to be a landing page.
 */
export default function OrderLookup() {
  const navigate = useNavigate()
  const { signedIn } = useAuth()
  const [form, setForm] = useState({ number: '', email: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // An email-and-number form is what a bot uses to test leaked addresses
  // against sequential order numbers, so a store may put a captcha on it.
  const captcha = useCaptcha('lookup')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const order = await api.lookupOrder(withCaptcha(form, await captcha.getToken()))
      navigate(`/order/${order.id}`, { state: { order } })
    } catch (err) {
      captcha.reset()
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Seo title="Find your order" noindex />
      <div className="wrap max-w-md py-16 pb-24">
        <p className="eyebrow">Order lookup</p>
        <h1 className="mt-3 text-display-lg">Find your order</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          The order number is in your confirmation email — it looks like{' '}
          <span className="font-mono text-ink">LM-10428</span>.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="order-number" className="mb-1.5 block text-[13px] font-medium">
              Order number
            </label>
            <input
              id="order-number"
              className="field font-mono"
              placeholder="LM-10428"
              autoComplete="off"
              value={form.number}
              onChange={set('number')}
              required
            />
          </div>

          <div>
            <label htmlFor="order-email" className="mb-1.5 block text-[13px] font-medium">
              Email address
            </label>
            <input
              id="order-email"
              type="email"
              className="field"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              required
            />
            <p className="mt-1.5 text-[12px] text-faint">
              The one you used at checkout. Both have to match — an order number on its own would
              let anyone read anyone&rsquo;s order.
            </p>
          </div>

          {captcha.widget}

          {error && (
            <div className="rounded-xs border border-line p-4">
              <ErrorState error={error} />
            </div>
          )}

          <Button as="button" type="submit" size="lg" full disabled={busy}>
            {busy ? 'Looking…' : 'Find my order'}
          </Button>
        </form>

        <p className="mt-8 text-[13px] leading-relaxed text-muted">
          {signedIn ? (
            <>
              Signed in — everything you have ordered with this account is under{' '}
              <a href="/account/orders" className="link-underline text-ink">
                your orders
              </a>
              .
            </>
          ) : (
            <>
              Ordered with an account?{' '}
              <a href="/login" className="link-underline text-ink">
                Sign in
              </a>{' '}
              and they are all there.
            </>
          )}
        </p>
      </div>
    </>
  )
}
