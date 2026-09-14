import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Seo from '../components/Seo.jsx'
import api from '../lib/api/index.js'
import { failureMessage, isFailed, isSettled, pollPayment } from '../lib/payments/index.js'
import { useCart } from '../store/CartContext.jsx'
import { Button, Empty, Icon } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'

/**
 * Where a gateway's hosted page sends the shopper back.
 *
 * The URL carries only the payment's opaque id. Whatever the gateway put in the
 * query string proves nothing, so the page asks the backend and goes where the
 * answer says: the order, or back to checkout with the reason.
 */
export default function CheckoutReturn() {
  const [params] = useSearchParams()
  const paymentId = params.get('payment') || ''
  const navigate = useNavigate()
  const { refresh } = useCart()
  const [state, setState] = useState({ phase: paymentId ? 'checking' : 'missing', payment: null })

  useEffect(() => {
    if (!paymentId) return undefined
    const controller = new AbortController()
    ;(async () => {
      try {
        const { payment, timedOut, aborted } = await pollPayment(paymentId, {
          getPayment: api.getPayment,
          signal: controller.signal,
        })
        if (aborted || controller.signal.aborted) return
        if (payment && isSettled(payment) && payment.order) {
          await refresh().catch(() => {})
          navigate(`/order/${payment.order.id}`, { replace: true })
          return
        }
        if (payment && isFailed(payment)) {
          // Paying for a placed order goes back to that order; paying for a bag, back to checkout.
          const back = payment.order ? `/order/${payment.order.id}?pay=1` : '/checkout'
          navigate(back, { replace: true, state: { paymentMessage: failureMessage(payment) } })
          return
        }
        setState({ phase: timedOut ? 'timeout' : 'missing', payment })
      } catch (error) {
        if (!controller.signal.aborted) setState({ phase: error?.status === 404 ? 'missing' : 'error', payment: null, error })
      }
    })()
    return () => controller.abort()
  }, [paymentId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Seo title={t('Confirming payment')} noindex />
      <div className="wrap max-w-xl py-20">
        {state.phase === 'checking' && (
          <div role="status" className="flex flex-col items-center gap-4 text-center">
            <Icon name="refresh" size={22} className="animate-spin text-accent" />
            <h1 className="text-display-md">{t('Confirming your payment…')}</h1>
            <p className="text-[14px] text-muted">{t('This usually takes a few seconds. Please keep this page open.')}</p>
          </div>
        )}

        {state.phase === 'timeout' && (
          <div role="status" className="text-center">
            <h1 className="text-display-md">{t('Still waiting on the payment provider')}</h1>
            <p className="mt-4 text-[14px] leading-relaxed text-muted">
              {t('If your payment went through, we will email you as soon as it is confirmed. There is no need to pay again.')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {state.payment?.order && <Button to={`/order/${state.payment.order.id}`}>{t('View your order')}</Button>}
              <Button to="/orders/lookup" variant="quiet">{t('Find an order')}</Button>
            </div>
          </div>
        )}

        {(state.phase === 'missing' || state.phase === 'error') && (
          <Empty
            icon="package"
            title={state.phase === 'missing' ? t('We could not find that payment') : t('We could not check your payment')}
            body={
              state.phase === 'missing'
                ? t('The link may be incomplete. If you were charged, your order confirmation will arrive by email.')
                : state.error?.message || t('Please try again in a moment.')
            }
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button to="/checkout">{t('Back to checkout')}</Button>
                <Link to="/orders/lookup" className="self-center text-[13px] text-muted link-underline">{t('Find an order')}</Link>
              </div>
            }
          />
        )}
      </div>
    </>
  )
}
