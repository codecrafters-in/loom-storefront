import { useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../ui/index.jsx'
import { clearCompare, compared, serverCompared, subscribeCompare, toggleCompare } from '../../lib/compare.js'

export const useCompared = () => useSyncExternalStore(subscribeCompare, compared, serverCompared)

/**
 * "Compare (2)", pinned to the corner while there is something to compare.
 *
 * Bottom left, because the demo's pill has the bottom right, and below the
 * sticky buy bar, which is the one fixed thing on a product page that must win.
 */
export default function CompareTray() {
  const list = useCompared()
  const { pathname } = useLocation()
  if (!list.length || pathname === '/compare') return null
  return (
    <div className="fixed bottom-4 left-4 z-20 flex items-center gap-1 rounded-full border border-line bg-page/95 py-1 pl-4 pr-1 text-[13px] shadow-panel backdrop-blur">
      <Link to={`/compare?slugs=${list.map(encodeURIComponent).join(',')}`} className="link-underline font-medium">
        Compare ({list.length})
      </Link>
      <button
        type="button"
        onClick={clearCompare}
        aria-label="Clear comparison"
        className="grid h-8 w-8 place-items-center rounded-full text-faint transition-colors hover:text-ink"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

export function CompareToggle({ slug, className = '' }) {
  const list = useCompared()
  const on = list.includes(slug)
  return (
    <button
      type="button"
      onClick={() => toggleCompare(slug)}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink ${className}`}
    >
      <Icon name={on ? 'check' : 'plus'} size={14} />
      {on ? 'Comparing' : 'Compare'}
    </button>
  )
}
