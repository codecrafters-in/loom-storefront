import { useEffect, useRef, useState } from 'react'
import { Icon, Skeleton } from '../ui/index.jsx'
import { driverFor } from '../../lib/payments/drivers/index.js'
import { OUTCOMES } from '../../lib/payments/drivers/demo.js'
import { formatMoney } from '../../lib/money.js'
import { t } from '../../i18n/index.js'

/**
 * The payment methods the backend offers for this cart.
 *
 * A fieldset of native radios, so a keyboard and a screen reader get a real
 * radio group for free. Logos are decoration next to a name that already says
 * what the method is, so they carry no alt text of their own.
 */
export default function PaymentStep({
  methods,
  selected,
  onSelect,
  loading,
  error,
  disabled,
  demoInput,
  onDemoInput,
  saveMethod,
  onSaveMethod,
  onDriverReady,
}) {
  return (
    <fieldset className="mt-10" disabled={disabled} aria-busy={loading || undefined}>
      <legend className="mb-4 text-[13px] font-medium uppercase tracking-[0.08em]">{t('Payment')}</legend>

      {loading && !methods.length && <Skeleton className="h-28 w-full" />}

      {error && (
        <p role="alert" className="rounded-xs border border-sale/25 bg-surface p-3.5 text-[13px] text-sale">
          {error.message}
        </p>
      )}

      {!loading && !error && methods.length === 0 && (
        <p className="rounded-xs border border-line bg-surface p-3.5 text-[13px] text-muted">
          {t('No payment method can take this order to this address. Check the country, or contact us and we will sort it out.')}
        </p>
      )}

      <div className="space-y-2.5">
        {methods.map((method) => {
          const checked = selected === method.key
          return (
            <div key={method.key} className={`rounded-xs border transition-colors ${checked ? 'border-ink' : 'border-line hover:border-muted'}`}>
              <label className="flex cursor-pointer items-center gap-3.5 p-4">
                <input
                  type="radio"
                  name="payment-method"
                  value={method.key}
                  checked={checked}
                  onChange={() => onSelect(method.key)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {method.name}
                    {method.test && (
                      <span className="rounded-xs bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                        {t('Test')}
                      </span>
                    )}
                  </span>
                  <span className="block text-[13px] text-faint">
                    {method.saved ? t('Saved {method}', { method: method.methodName || t('method') }) : method.providerName !== method.name ? method.providerName : ''}
                  </span>
                  {method.fee?.amount > 0 && (
                    <span className="block text-[13px] text-muted">{t('Adds a {fee} fee', { fee: formatMoney(method.fee) })}</span>
                  )}
                </span>
                <MethodMarks method={method} />
              </label>

              {checked && method.note && (
                <p className="flex gap-2 border-t border-line px-4 py-3 text-[13px] leading-relaxed text-muted">
                  <Icon name="info" size={15} className="mt-0.5 shrink-0 text-accent" />
                  {method.note}
                </p>
              )}

              {checked && !method.saved && method.canSave && onSaveMethod && (
                <label className="flex items-center gap-2.5 border-t border-line px-4 py-3 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(saveMethod)}
                    onChange={(e) => onSaveMethod(e.target.checked)}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  {t('Save for next time')}
                </label>
              )}

              {checked && !method.saved && driverFor(method.provider)?.mount && (
                <MountedForm
                  driver={driverFor(method.provider)}
                  method={method}
                  saveMethod={saveMethod}
                  onReady={onDriverReady}
                />
              )}

              {checked && !method.saved && method.provider === 'demo' && (
                <DemoCardFields value={demoInput} onChange={onDemoInput} />
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

function MethodMarks({ method }) {
  const brands = (method.brands || []).filter((b) => b.image).slice(0, 4)
  if (brands.length) {
    return (
      <span className="flex shrink-0 items-center gap-1" aria-label={brands.map((b) => b.name).join(', ')}>
        {brands.map((brand) => (
          <img key={brand.name} src={brand.image} alt="" width="32" height="20" loading="lazy" className="h-5 w-8 object-contain" />
        ))}
      </span>
    )
  }
  if (method.image) {
    return <img src={method.image} alt="" width="40" height="24" loading="lazy" className="h-6 w-10 shrink-0 object-contain" />
  }
  return null
}

function DemoCardFields({ value, onChange }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value })
  return (
    <div className="space-y-3 border-t border-line px-4 py-4">
      <p className="text-[12px] leading-relaxed text-faint">
        {t('Test mode — no card is charged. Use any number, and choose what the payment should do.')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="demo-card-number" className="mb-1.5 block text-[13px] font-medium">{t('Test card number')}</label>
          <input
            id="demo-card-number"
            className="field"
            inputMode="numeric"
            autoComplete="off"
            value={value.cardNumber}
            onChange={set('cardNumber')}
          />
        </div>
        <div>
          <label htmlFor="demo-outcome" className="mb-1.5 block text-[13px] font-medium">{t('Outcome')}</label>
          <select id="demo-outcome" className="field" value={value.outcome} onChange={set('outcome')}>
            {OUTCOMES.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

/**
 * A gateway's own form (Stripe's card fields), shown while its method is picked. The gateway draws it in its
 * own iframe; the page only keeps the handle the driver returns, for Pay.
 */
function MountedForm({ driver, method, saveMethod, onReady }) {
  const container = useRef(null)
  const handle = useRef(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setError(null)
    setLoading(true)
    driver
      .mount(container.current, method, { saveMethod: Boolean(saveMethod) })
      .then((mounted) => {
        if (!alive) {
          mounted?.destroy?.()
          return
        }
        handle.current = mounted
        onReady?.(mounted)
      })
      .catch((err) => alive && setError(err))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
      handle.current?.destroy?.()
      handle.current = null
      onReady?.(null)
    }
  }, [driver, method.key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    handle.current?.setSaveMethod?.(Boolean(saveMethod))
  }, [saveMethod])

  return (
    <div className="border-t border-line px-4 py-4">
      {loading && !error && <Skeleton className="h-24 w-full" />}
      <div ref={container} />
      {error && <p role="alert" className="mt-2 text-[13px] text-sale">{error.message}</p>}
    </div>
  )
}

