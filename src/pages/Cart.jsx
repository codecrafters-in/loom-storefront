import { lazy, Suspense, useEffect, useState } from 'react'
import Seo from '../components/Seo.jsx'
import { Link } from 'react-router-dom'
import { useCart } from '../store/CartContext.jsx'
import { useToast } from '../store/ToastContext.jsx'
import { useWishlist } from '../store/WishlistContext.jsx'
import api from '../lib/api/index.js'
import { Button, Empty, Icon, QuantityStepper, Skeleton } from '../components/ui/index.jsx'
import Promises from '../components/layout/Promises.jsx'
import { formatMoney } from '../lib/money.js'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { isMock } from '../lib/config.js'
import Media from '../components/ui/Media.jsx'
import { SIZES } from '../lib/images.js'
import { nestLines } from '../lib/cart-lines.js'
import { stepperProps } from '../lib/quantity.js'
import LineDetails from '../components/cart/LineDetails.jsx'
import PaymentLock from '../components/cart/PaymentLock.jsx'
import { t, plural } from '../i18n/index.js'
import { viewCart } from '../lib/analytics.js'

const ExpressCheckout = lazy(() => import('../components/checkout/ExpressCheckout.jsx'))

export default function Cart() {
  const { cart, loading, busy, update, remove, refresh } = useCart()
  const { push } = useToast()
  const [code, setCode] = useState('')
  const [working, setWorking] = useState(false)
  const [giftCode, setGiftCode] = useState('')
  const [gift, setGift] = useState(null)

  // Once per bag opened on this page, not on every quantity change.
  useEffect(() => {
    if (cart?.lines?.length) viewCart(cart)
  }, [cart?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A code or reward action: the backend answers the new bag, the page takes it and says what happened. */
  const act = async (work, said) => {
    setWorking(true)
    try {
      const next = await work()
      await refresh()
      const message = typeof said === 'function' ? said(next) : said
      if (message) push(message)
      return next
    } catch (err) {
      push(err.message, { tone: 'error' })
      return null
    } finally {
      setWorking(false)
    }
  }
  const signature = (c) => JSON.stringify([c?.codes, c?.discount?.amount, c?.lines?.length, c?.claimableRewards?.length])
  const config = useStorefront()
  const wishlist = useWishlist()
  // Under the store's minimum order (`minimumOrder`, from Odoo): checkout would refuse it, so it is not offered.
  const short = cart?.minimumOrder?.remaining?.amount > 0

  if (loading) {
    return (
      <div className="wrap grid gap-10 py-14 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!cart?.lines.length) {
    return (
      <>
        <Empty
          icon="bag"
          title={t('Your bag is empty')}
          body={t('Have a look at what is new, or pick up something you saved earlier.')}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button to="/shop" size="lg">{t('Shop everything')}</Button>
              <Button to="/wishlist" variant="outline" size="lg">{t('Saved items')}</Button>
            </div>
          }
        />
        <Promises />
      </>
    )
  }

  return (
    <>
      <Seo title={t('Your bag')} noindex />
      <div className="wrap py-10">
        <h1 className="text-display-lg">{t('Your bag')}</h1>
        <p className="mt-3 text-[15px] text-muted">
          {plural(cart.lines.length, '{count} item', '{count} items')}
        </p>
        <PaymentLock className="mt-6" />
      </div>

      <div className="wrap grid items-start gap-12 pb-20 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-line border-y border-line">
          {/* An optional product sits under, and indented from, the line it was added with. */}
          {nestLines(cart.lines).map(({ line, depth }) => (
            <li key={line.id} className={`flex gap-5 py-6 ${depth ? 'ps-8 sm:ps-14' : ''}`}>
              <Link to={`/product/${line.productSlug}`} className="w-24 shrink-0 sm:w-28">
                <div className="shot rounded-xs">
                  <Media sizes={SIZES.thumb} src={line.image?.url} type={line.image?.type} alt={line.image?.alt || line.title} loading="lazy" className="h-full w-full object-cover" />
                </div>
              </Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-4">
                  <div className="min-w-0">
                    <Link to={`/product/${line.productSlug}`} className="text-[15px] font-medium">
                      {line.title}
                    </Link>
                    <LineDetails line={line} className="text-[13px] text-faint" />
                  </div>
                  <span className="shrink-0 text-[15px] tabular-nums">{formatMoney(line.lineTotal)}</span>
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  {line.isReward ? (
                    <span className="text-[13px] text-good">{t('Free · {reward}', { reward: line.rewardLabel || t('Reward') })}</span>
                  ) : (
                    <>
                      <QuantityStepper value={line.quantity} onChange={(q) => update(line.id, q)} disabled={busy} {...stepperProps(line.quantityRule)} />
                      <span className="flex items-center gap-4">
                        {config.features?.wishlist !== false && !line.linkedTo && (
                          <button
                            type="button"
                            disabled={busy || working}
                            onClick={() => act(() => api.saveForLater(line.id, line.productSlug), t('{title} saved for later', { title: line.title })).then(wishlist.reload)}
                            className="inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-ink"
                          >
                            <Icon name="heart" size={14} /> {t('Save for later')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => remove(line.id)}
                          className="inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-sale"
                        >
                          <Icon name="trash" size={14} /> {t('Remove')}
                        </button>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24">
          <div className="rounded-xs border border-line bg-surface p-6">
            <h2 className="font-display text-lg">{t('Summary')}</h2>

            {cart.freeShippingRemaining?.amount > 0 && (
              <div className="mt-5 rounded-xs bg-accent-soft/60 p-3.5">
                <p className="text-[13px] text-accent">
                  {t('Add {amount} for free shipping', { amount: formatMoney(cart.freeShippingRemaining) })}
                </p>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-accent transition-[width] duration-500"
                    style={{
                      // Odoo's own measure when the API sends it (the total without delivery), not the subtotal.
                      width: `${cart.freeShippingProgress?.percent ?? Math.min(100, (cart.subtotal.amount / cart.freeShippingThreshold.amount) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {config.features?.discountCodes !== false && (
            <>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const entered = code.trim()
                if (!entered) return
                const before = signature(cart)
                const next = await act(() => api.addCode(entered), (after) => (signature(after) === before ? t('That code didn’t change your bag.') : t('Code applied')))
                if (next) setCode('')
              }}
              className="mt-5 flex gap-2"
            >
              <label className="sr-only" htmlFor="discount">{t('Discount code')}</label>
              <input
                id="discount"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('Discount code')}
                className="field h-10 text-[13px]"
              />
              <Button as="button" type="submit" variant="quiet" size="sm" disabled={busy || working} className="shrink-0 h-10">
                {t('Apply')}
              </Button>
            </form>
            {(cart.codes?.length ? cart.codes : cart.discountCode ? [cart.discountCode] : []).map((c) => (
              <p key={c.code} className="mt-2 flex items-center gap-1.5 text-[12px] text-good">
                <Icon name="check" size={13} />
                <span className="min-w-0 flex-1">{c.code} — {c.label}</span>
                <button
                  type="button"
                  className="text-faint link-underline hover:text-sale"
                  disabled={working}
                  onClick={() => act(() => api.removeCode(c.code), t('Code removed'))}
                >
                  {t('Remove')}
                </button>
              </p>
            ))}
            {cart.claimableRewards?.length > 0 && (
              <div className="mt-4 rounded-xs border border-line p-3.5">
                <p className="text-[13px] font-medium">{t('Choose your reward')}</p>
                <ul className="mt-2 space-y-2">
                  {cart.claimableRewards.map((reward) => (
                    <RewardChoice
                      key={reward.id}
                      reward={reward}
                      disabled={working}
                      onClaim={(variantId) => act(() => api.claimReward({ couponId: reward.couponId, rewardId: reward.rewardId, variantId }), t('Reward added'))}
                    />
                  ))}
                </ul>
              </div>
            )}
            <form
              className="mt-4 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!giftCode.trim()) return
                try {
                  setGift({ code: giftCode.trim(), ...(await api.getGiftCard(giftCode.trim())) })
                } catch (err) {
                  setGift({ code: giftCode.trim(), error: err.message })
                }
              }}
            >
              <label className="sr-only" htmlFor="gift-card">{t('Gift card code')}</label>
              <input id="gift-card" value={giftCode} onChange={(e) => setGiftCode(e.target.value)} placeholder={t('Check a gift card')} className="field h-10 text-[13px]" />
              <Button as="button" type="submit" variant="quiet" size="sm" className="shrink-0 h-10">{t('Check')}</Button>
            </form>
            {gift && (
              <p role="status" className={`mt-2 text-[12px] ${gift.error ? 'text-sale' : 'text-muted'}`}>
                {gift.error || t('Balance on {code}: {balance}. Enter it as a code to use it.', { code: gift.code, balance: formatMoney(gift.balance) })}
              </p>
            )}
            {isMock && <p className="mt-2 text-[11px] text-faint">{t('Demo codes: {codes}', { codes: 'LOOM10, WELCOME15, FREESHIP' })}</p>}
            </>
            )}

            <dl className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm">
              <Row label={t('Subtotal')} value={formatMoney(cart.subtotal)} />
              {cart.codes || cart.promotions ? (
                [...(cart.codes || []).map((c) => ({ key: `code-${c.code}`, label: c.label || c.code, amount: c.amount })),
                  ...(cart.promotions || []).map((p) => ({ key: `promo-${p.name}`, label: p.name, amount: p.amount }))]
                  .filter((row) => row.amount?.amount > 0)
                  .map((row) => <Row key={row.key} label={row.label} value={`−${formatMoney(row.amount)}`} tone="sale" />)
              ) : cart.discount.amount > 0 && (
                <Row label={cart.discountCode?.label || t('Discount')} value={`−${formatMoney(cart.discount)}`} tone="sale" />
              )}
              <Row label={t('Shipping')} value={cart.shipping.amount === 0 ? t('Free') : formatMoney(cart.shipping)} />
              <Row label={t('Estimated tax')} value={formatMoney(cart.tax)} />
            </dl>
            {config.pricing?.showTaxNote && config.pricing?.taxNote && (
              <p className="mt-2 text-[11px] text-faint">{config.pricing.taxNote}</p>
            )}
            <p className="mt-4 flex justify-between border-t border-line pt-4 text-lg">
              <span>{t('Total')}</span>
              <span className="tabular-nums">{formatMoney(cart.total)}</span>
            </p>

            {short && (
              <p role="status" className="mt-5 rounded-xs bg-accent-soft/60 p-3.5 text-[13px] text-accent">
                {t('Orders start at {minimum}. Add {remaining} more to check out.', { minimum: formatMoney(cart.minimumOrder.amount), remaining: formatMoney(cart.minimumOrder.remaining) })}
              </p>
            )}
            {/* A wallet sheet has no terms checkbox and no minimum: those orders go through the checkout form. */}
            {!isMock && config.checkout?.mode === 'payments' && !config.checkout?.termsRequired && !short && (
              <Suspense fallback={null}>
                <ExpressCheckout className="mt-6" />
              </Suspense>
            )}
            {short
              ? <Button as="button" type="button" full size="lg" className="mt-6" disabled>{t('Checkout')}</Button>
              : <Button to="/checkout" full size="lg" className="mt-6">{t('Checkout')}</Button>}
            <Link to="/shop" className="mt-4 block text-center text-[13px] text-muted link-underline">
              {t('Continue shopping')}
            </Link>
          </div>
        </aside>
      </div>

      <Promises />
    </>
  )
}

function Row({ label, value, tone }) {
  return (
    <div className="flex justify-between">
      <dt className={tone === 'sale' ? 'text-sale' : 'text-muted'}>{label}</dt>
      <dd className={`tabular-nums ${tone === 'sale' ? 'text-sale' : ''}`}>{value}</dd>
    </div>
  )
}

/** One reward the bag can claim: a button, or a product to pick first when there is a choice. */
function RewardChoice({ reward, disabled, onClaim }) {
  const [variantId, setVariantId] = useState(reward.products?.[0]?.variantId || '')
  const many = (reward.products?.length || 0) > 1
  return (
    <li className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="min-w-0 flex-1">{reward.description}</span>
      {many && (
        <select aria-label={t('Choose for {reward}', { reward: reward.description })} className="field h-9 w-auto text-[13px]" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
          {reward.products.map((p) => <option key={p.variantId} value={p.variantId}>{p.title}</option>)}
        </select>
      )}
      <Button as="button" type="button" size="sm" variant="quiet" disabled={disabled} onClick={() => onClaim(variantId || undefined)}>
        {t('Add')}
      </Button>
    </li>
  )
}

