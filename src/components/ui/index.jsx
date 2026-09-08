import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { formatMoney, discountPercent } from '../../lib/money.js'

export { default as Icon } from './Icon.jsx'

/* ── button ────────────────────────────────────────────────────────────── */

const VARIANTS = {
  primary: 'bg-ink text-page hover:bg-accent disabled:hover:bg-ink',
  accent: 'bg-accent text-accent-ink hover:bg-ink disabled:hover:bg-accent',
  outline: 'border border-ink text-ink hover:bg-ink hover:text-page',
  ghost: 'text-ink hover:bg-sunken',
  quiet: 'border border-line bg-surface text-ink hover:border-ink',
}
const SIZES = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[52px] px-7 text-[15px]',
}

/**
 * One button, three shapes. `to` renders a Link, `href` an anchor, otherwise a
 * real <button> — so a navigation never ends up as a div with an onClick.
 */
export const Button = forwardRef(function Button(
  { as, to, href, variant = 'primary', size = 'md', full = false, icon, iconRight, className = '', children, ...rest },
  ref,
) {
  const Tag = as || (to ? Link : href ? 'a' : 'button')
  const props = to ? { to } : href ? { href } : { type: rest.type || 'button' }
  return (
    <Tag
      ref={ref}
      {...props}
      {...rest}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-xs font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 19 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 19 : 17} />}
    </Tag>
  )
})

/* ── price ─────────────────────────────────────────────────────────────── */

export function Price({ price, compareAt, size = 'md', className = '' }) {
  const pct = discountPercent(price, compareAt)
  const scale = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-[13px]' : 'text-[15px]'
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className={`${scale} ${pct ? 'text-sale' : 'text-ink'} tabular-nums`}>{formatMoney(price)}</span>
      {pct > 0 && (
        <>
          <s className="text-[13px] tabular-nums text-faint">{formatMoney(compareAt)}</s>
          <span className="text-[11px] font-medium text-sale">−{pct}%</span>
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
      <span className="sr-only">{value} out of 5</span>
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
  new: 'New',
  sale: 'Sale',
  bestseller: 'Bestseller',
  'low-stock': 'Low stock',
  'sold-out': 'Sold out',
}

export function Badge({ kind, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${BADGE_TONE[kind] || 'bg-sunken text-muted'} ${className}`}
    >
      {children || BADGE_LABEL[kind] || kind}
    </span>
  )
}

/* ── quantity ──────────────────────────────────────────────────────────── */

export function QuantityStepper({ value, onChange, min = 1, max = 99, disabled = false, size = 'md' }) {
  const h = size === 'sm' ? 'h-8' : 'h-10'
  const btn = 'grid w-8 place-items-center text-muted transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-muted'
  return (
    <div className={`inline-flex ${h} items-center rounded-xs border border-line bg-surface`}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label="Decrease quantity">
        <Icon name="minus" size={14} />
      </button>
      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{value}</span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label="Increase quantity">
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
        {error?.code || 'error'}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink">
        {error?.message || 'Something went wrong.'}
      </p>
      {onRetry && (
        <Button variant="quiet" size="sm" className="mt-5" onClick={onRetry}>
          Try again
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
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
      {trail.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1.5">
          {i > 0 && <Icon name="chevron-right" size={12} className="text-line" />}
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
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="grid h-9 w-9 place-items-center rounded-xs border border-line text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-30"
        aria-label="Previous page"
      >
        <Icon name="chevron-left" size={15} />
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
        aria-label="Next page"
      >
        <Icon name="chevron-right" size={15} />
      </button>
    </nav>
  )
}
