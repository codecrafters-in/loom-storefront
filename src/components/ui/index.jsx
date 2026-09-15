import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { formatMoney, discountPercent, MIN_DISCOUNT } from '../../lib/money.js'
import { t, mark } from '../../i18n/index.js'

export { default as Icon } from './Icon.jsx'

/* ── button ────────────────────────────────────────────────────────────── */

const VARIANTS = {
  primary: 'bg-ink text-page hover:bg-accent disabled:hover:bg-ink',
  accent: 'bg-accent text-accent-ink hover:bg-ink disabled:hover:bg-accent',
  outline: 'border border-ink text-ink hover:bg-ink hover:text-page',
  ghost: 'text-ink hover:bg-sunken',
  quiet: 'border border-line bg-surface text-ink hover:border-ink',
  // Something that cannot be undone, such as closing an account.
  danger: 'bg-sale text-page hover:bg-ink disabled:hover:bg-sale',
}
const SIZES = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[52px] px-7 text-[15px]',
}

/**
 * Icon-only buttons need their own sizes, not a padding override.
 *
 * `className="w-[52px] px-0"` looks like it works and does not: both `px-0`
 * and `px-7` are plain utilities of equal specificity, so the winner is
 * whichever Tailwind emits later — and it sorts by value, which puts `px-7`
 * after `px-0`. A 52px-wide button with 28px of padding on each side has a
 * negative content box, so the icon inside it is squeezed to nothing and the
 * button renders empty. That is what happened to the save-for-later heart.
 *
 * Giving the shape its own class is the fix; a call site should never have to
 * win a specificity argument with the component it is calling.
 */
const SQUARE = {
  sm: 'h-9 w-9 text-[13px]',
  md: 'h-11 w-11 text-sm',
  lg: 'h-[52px] w-[52px] text-[15px]',
}

/**
 * One button, three shapes. `to` renders a Link, `href` an anchor, otherwise a
 * real <button> — so a navigation never ends up as a div with an onClick.
 */
export const Button = forwardRef(function Button(
  { as, to, href, variant = 'primary', size = 'md', full = false, square = false, icon, iconRight, className = '', children, ...rest },
  ref,
) {
  const Tag = as || (to ? Link : href ? 'a' : 'button')
  const props = to ? { to } : href ? { href } : { type: rest.type || 'button' }
  return (
    <Tag
      ref={ref}
      {...props}
      {...rest}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-xs font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${square ? SQUARE[size] : SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 19 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 19 : 17} />}
    </Tag>
  )
})

/* ── price ─────────────────────────────────────────────────────────────── */

/**
 * `to` renders a range: "$89.00 – $199.00".
 *
 * Needed the moment variants can be priced individually. Showing a single
 * amount while the shopper has chosen a colour but not a size is a number that
 * silently changes under them when they pick one — and a price that moves after
 * the decision is the kind of surprise that ends the session, however honest the
 * arithmetic. A range says up front that size is a pricing question here.
 *
 * A compare-at is deliberately not rendered alongside a range: "was" against
 * two numbers is not a claim anybody can check.
 */
export function Price({ price, to, compareAt, size = 'md', className = '' }) {
  const pct = to ? 0 : discountPercent(price, compareAt)
  const scale = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-[13px]' : 'text-[15px]'
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className={`${scale} ${pct ? 'text-sale' : 'text-ink'} tabular-nums`}>
        {formatMoney(price)}
        {to && <span className="text-faint"> – </span>}
        {to && formatMoney(to)}
      </span>
      {pct > 0 && (
        <>
          <s className="text-[13px] tabular-nums text-faint">{formatMoney(compareAt)}</s>
          {/* The old price is a fact and always shows. The percentage is a
              claim, and below the threshold it is one not worth making. */}
          {pct >= MIN_DISCOUNT && <span className="text-[11px] font-medium text-sale">−{pct}%</span>}
        </>
      )}
    </span>
  )
}

/* ── rating ────────────────────────────────────────────────────────────── */

export function Rating({ value = 0, count, size = 13, showCount = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon
            key={n}
            name="star"
            size={size}
            filled={n <= Math.round(value)}
            className={n <= Math.round(value) ? 'text-accent' : 'text-line'}
          />
        ))}
      </span>
      <span className="sr-only">{t('{value} out of 5', { value })}</span>
      {showCount && count !== undefined && (
        <span className="text-[12px] text-faint tabular-nums">({count})</span>
      )}
    </span>
  )
}

/* ── badge ─────────────────────────────────────────────────────────────── */

const BADGE_TONE = {
  new: 'bg-ink text-page',
  sale: 'bg-sale text-white',
  bestseller: 'bg-accent-soft text-accent',
  'low-stock': 'border border-line bg-surface text-muted',
  'sold-out': 'bg-sunken text-faint',
}
const BADGE_LABEL = {
  new: mark('New'),
  sale: mark('Sale'),
  bestseller: mark('Bestseller'),
  'low-stock': mark('Low stock'),
  'sold-out': mark('Sold out'),
}

export function Badge({ kind, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${BADGE_TONE[kind] || 'bg-sunken text-muted'} ${className}`}
    >
      {children || (BADGE_LABEL[kind] && t(BADGE_LABEL[kind])) || kind}
    </span>
  )
}

/* ── quantity ──────────────────────────────────────────────────────────── */

/**
 * `step` and `unit` for things not sold one at a time — coffee by the quarter
 * kilo. Pass the props from `stepperProps()` in lib/quantity.js, which reads the
 * product's rule, so the stepper never offers a quantity the server refuses.
 */
export function QuantityStepper({ value, onChange, min = 1, max = 99, step = 1, unit = '', disabled = false, size = 'md' }) {
  const h = size === 'sm' ? 'h-8' : 'h-10'
  const btn = 'grid w-8 place-items-center text-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-muted'
  // Rounded to three places, or a quarter-kilo step drifts into 0.7500000001.
  const move = (dir) => onChange(Math.min(max, Math.max(min, Math.round((value + dir * step) * 1000) / 1000)))
  return (
    <div className={`inline-flex ${h} items-center rounded-xs border border-line bg-surface`}>
      <button type="button" className={btn} onClick={() => move(-1)} disabled={disabled || value <= min} aria-label={t('Decrease quantity')}>
        <Icon name="minus" size={14} />
      </button>
      <span className="min-w-8 px-0.5 text-center text-sm tabular-nums" aria-live="polite">
        {value}
        {unit && <span className="ms-0.5 text-[11px] text-faint">{unit}</span>}
      </span>
      <button type="button" className={btn} onClick={() => move(1)} disabled={disabled || value + step > max + 1e-9} aria-label={t('Increase quantity')}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

/* ── states ────────────────────────────────────────────────────────────── */

export function Empty({ icon = 'bag', title, body, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-20 text-center ${className}`}>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-sunken text-muted">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="mt-6 text-display-md">{title}</h2>
      {body && <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="mx-auto max-w-lg rounded-xs border border-sale/25 bg-surface p-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sale">
        {error?.code || t('error')}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink">
        {error?.message || t('Something went wrong.')}
      </p>
      {error?.detail?.errorId && (
        // What support needs to find this failure in Odoo's log.
        <p className="mt-2 font-mono text-[11px] text-faint">{t('Reference: {id}', { id: error.detail.errorId })}</p>
      )}
      {onRetry && (
        <Button variant="quiet" size="sm" className="mt-5" onClick={onRetry}>
          {t('Try again')}
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-xs ${className}`} />
}

/* ── breadcrumbs ───────────────────────────────────────────────────────── */

export function Breadcrumbs({ trail }) {
  return (
    <nav aria-label={t('Breadcrumb')} className="flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
      {trail.map((step, i) => (
        <span key={`${i}-${step.label}`} className="flex items-center gap-1.5">
          {i > 0 && <Icon name="chevron-right" size={12} className="text-line rtl:-scale-x-100" />}
          {step.to && i < trail.length - 1 ? (
            <Link to={step.to} className="transition-colors hover:text-ink">{step.label}</Link>
          ) : (
            <span className="text-muted">{step.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ── pagination ────────────────────────────────────────────────────────── */

export function Pagination({ page, perPage, total, onPage }) {
  const pages = Math.ceil(total / perPage)
  if (pages <= 1) return null
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  )
  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label={t('Pagination')}>
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="grid h-9 w-9 place-items-center rounded-xs border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-30"
        aria-label={t('Previous page')}
      >
        <Icon name="chevron-left" size={15} className="rtl:-scale-x-100" />
      </button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && nums[i - 1] !== n - 1 && <span className="px-1 text-faint">…</span>}
          <button
            type="button"
            onClick={() => onPage(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`h-9 min-w-9 rounded-xs px-2 text-sm tabular-nums transition-colors ${
              n === page ? 'bg-ink text-page' : 'border border-line text-muted hover:border-ink hover:text-ink'
            }`}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        className="grid h-9 w-9 place-items-center rounded-xs border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-30"
        aria-label={t('Next page')}
      >
        <Icon name="chevron-right" size={15} className="rtl:-scale-x-100" />
      </button>
    </nav>
  )
}
