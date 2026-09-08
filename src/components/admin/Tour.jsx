import { useEffect, useState } from 'react'
import { Icon } from '../ui/index.jsx'

/**
 * First-run orientation.
 *
 * Three cards, dismissed forever on close. Deliberately not a modal takeover
 * and not a step-by-step spotlight tour: someone opening a back office wants to
 * look around, and an overlay that blocks the thing they came to see gets
 * clicked away before it is read.
 *
 * The rule this follows — say the one thing that is not guessable from the
 * interface, then get out of the way.
 */
const KEY = 'loom.tour.admin'

const CARDS = [
  {
    icon: 'sparkle',
    title: 'Changes are live',
    body: 'There is no publish step. Edit a price here and reload the shop — it is already there.',
  },
  {
    icon: 'filter',
    title: 'Stock moves by + and −',
    body: 'Never by typing a number. Two people adjusting the same size at once both land, instead of one overwriting the other.',
  },
  {
    icon: 'refresh',
    title: 'Export before you experiment',
    body: 'Import / export → Download JSON. Reset puts the demo catalogue back if something goes sideways.',
  },
]

export default function Tour() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(KEY) !== 'done')
    } catch {
      /* private mode — show it, it is only three cards */
    }
  }, [])

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      /* it will show again next time; harmless */
    }
  }

  if (!open) return null

  return (
    <section className="relative mb-8 rounded-xs border border-accent/25 bg-accent-soft/50 p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-accent/60 transition-colors hover:text-accent"
      >
        <Icon name="close" size={16} />
      </button>
      <p className="eyebrow text-accent">Three things worth knowing</p>
      <ul className="mt-4 grid gap-5 sm:grid-cols-3">
        {CARDS.map((c) => (
          <li key={c.title} className="flex gap-2.5">
            <Icon name={c.icon} size={16} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-[13px] font-medium text-ink">{c.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * An inline hint attached to a control.
 *
 * Used where a field's behaviour is genuinely surprising — minor units, delta
 * adjustments, cascading prices. Not used to restate a label, which is how
 * tooltips become noise people learn to skip.
 */
export function Hint({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        aria-label="Explain"
        aria-expanded={open}
        className="ml-1 text-faint transition-colors hover:text-accent"
      >
        <Icon name="info" size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xs border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted shadow-card"
        >
          {children}
        </span>
      )}
    </span>
  )
}
