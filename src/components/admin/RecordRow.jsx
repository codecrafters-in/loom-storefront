import { Icon } from '../ui/index.jsx'

/**
 * One row in an admin list.
 *
 * The whole row opens the record. An "Edit" link at the end of a row is a small
 * target for the only thing anyone opens a list to do, and it makes every list
 * in the product look slightly different from every other one.
 *
 * Destructive actions stay as explicit buttons — you cannot make "click the row"
 * mean delete — and they stop propagation so a mis-click deletes nothing.
 */
export default function RecordRow({ onOpen, label, children, actions, indent = false, selected = false }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-4 rounded-xs border bg-surface p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'border-accent' : 'border-line hover:border-ink'
      } ${indent ? 'ml-6' : ''}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions && (
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          {actions}
        </div>
      )}
      <Icon name="chevron-right" size={16} className="shrink-0 text-faint" />
    </div>
  )
}

/** A small destructive control that never fires from a row click. */
export function RowAction({ label, icon = 'trash', tone = 'sale', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-xs border border-transparent transition-colors hover:border-line ${
        tone === 'sale' ? 'text-faint hover:text-sale' : 'text-muted hover:text-ink'
      }`}
    >
      <Icon name={icon} size={15} />
    </button>
  )
}
