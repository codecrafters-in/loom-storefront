import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../../lib/api/index.js'
import { ApiError } from '../../lib/api/contracts.js'
import { driverInput, returnUrls, runPayment, visibleMethods } from '../../lib/payments/index.js'
import { driverFor } from '../../lib/payments/drivers/index.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { formatMoney } from '../../lib/money.js'
import { Button, Icon } from '../ui/index.jsx'
import PaymentStep from './PaymentStep.jsx'

const STILL_WAITING =
  'We have not heard back from the payment provider yet. If the payment went through, we will email you. There is no need to pay again.'

/**
 * "Pay now" on an order that is placed but not paid: a quotation the shop sent,
 * an order confirmed without payment, or a payment that failed after the order
 * was placed. The same methods and drivers as checkout, charged to the order
 * rather than to a bag. Loaded only for such an order.
 */
export default function PayNow({ order, autoOpen = false, notice: firstNotice = null, onPaid }) {
  const config = useStorefront()
  const [open, setOpen] = useState(autoOpen)
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [saveMethod, setSaveMethod] = useState(false)
  const [demoInput, setDemoInput] = useState({ cardNumber: '4242 4242 4242 4242', outcome: 'done' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(firstNotice)
  const mounted = useRef(null)
  const methods = useMemo(() => visibleMethods(options), [options])

  useEffect(() => {
    if (!open || options) return undefined
    let alive = true
    setLoading(true)
    setLoadError(null)
    api.getOrderPaymentOptions(order.id)
      .then((next) => {
        if (!alive) return
        setOptions(next)
        setSelected(visibleMethods(next)[0]?.key || null)
      })
      .catch((err) => {
        if (!alive) return
        if (err.code === 'nothing_to_pay') onPaid?.()
        else setLoadError(err)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async (event) => {
    event.preventDefault()
    const chosen = methods.find((m) => m.key === selected)
    if (!chosen || busy) return
    const driver = chosen.saved ? null : driverFor(chosen.provider)
    setBusy(true)
    setError(null)
    setNotice(null)
    const { input, problem } = await driverInput(driver, { demoInput, mounted: mounted.current })
    if (problem) {
      setError(new ApiError(problem, { code: 'invalid_card' }))
      setBusy(false)
      return
    }
    try {
      const created = await api.createOrderPayment(order.id, {
        ...(chosen.saved ? { tokenId: chosen.id } : { providerId: chosen.providerId, methodId: chosen.methodId }),
        saveMethod: saveMethod && chosen.canSave,
        ...returnUrls(config.checkout, window.location.origin),
      })
      const result = await runPayment(created, { api, input })
      if (result.kind === 'redirect') {
        window.location.assign(result.url)
        return
      }
      if (result.kind === 'order') await onPaid?.()
      else if (result.kind === 'timeout') setNotice(STILL_WAITING)
      else setError(new ApiError(result.message, { code: `payment_${result.payment.status}` }))
    } catch (err) {
      if (err.code === 'payment_cancelled') setNotice(err.message)
      else if (err.code === 'nothing_to_pay') await onPaid?.()
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="pay-now" className="mt-8 rounded-xs border border-ink bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="pay-now" className="eyebrow">Amount due</h2>
          <p className="mt-2 text-[22px] tabular-nums">{formatMoney(order.amountDue)}</p>
        </div>
        {!open && <Button onClick={() => setOpen(true)} iconRight="arrow-right">Pay now</Button>}
      </div>

      {notice && (
        <p role="status" className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-muted">
          <Icon name="info" size={16} className="mt-px shrink-0 text-accent" />
          <span>{notice}</span>
        </p>
      )}

      {open && (
        <form onSubmit={pay}>
          <PaymentStep
            methods={methods}
            selected={selected}
            onSelect={setSelected}
            loading={loading}
            error={loadError}
            disabled={busy}
            demoInput={demoInput}
            onDemoInput={setDemoInput}
            saveMethod={saveMethod}
            onSaveMethod={setSaveMethod}
            onDriverReady={(handle) => { mounted.current = handle }}
          />
          {error && (
            <p role="alert" className="mt-5 rounded-xs border border-sale/25 bg-page p-3.5 text-[13px] text-sale">{error.message}</p>
          )}
          <Button as="button" type="submit" full size="lg" className="mt-6" disabled={busy || loading || !selected}>
            {busy ? 'Processing payment…' : `Pay · ${formatMoney(order.amountDue)}`}
          </Button>
        </form>
      )}
    </section>
  )
}
