import { Icon } from '../ui/index.jsx'

/**
 * Search, filter and sort for an admin list.
 *
 * One component so every list behaves the same way — same order of controls,
 * same clear affordance, same result count. Lists that each invent their own
 * arrangement are the reason back offices feel improvised, and the cost of
 * fixing that later is every screen.
 *
 * Filtering happens client-side against an already-loaded page. That is right
 * for a few hundred rows and wrong for fifty thousand; past that the query
 * belongs in the request, which is why the shape here matches the one
 * `GET /products` already accepts.
 */
export default function ListToolbar({
  query,
  onQuery,
  placeholder = 'Search',
  filters = [],
  sorts = [],
  sort,
  onSort,
  count,
  total,
  className = '',
}) {
  const active = filters.filter((f) => f.value && f.value !== f.options[0].value).length
  const dirty = active > 0 || !!query

  const clear = () => {
    onQuery?.('')
    filters.forEach((f) => f.onChange(f.options[0].value))
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {onQuery && (
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              className="field h-9 pl-9 text-[13px]"
            />
          </div>
        )}

        {filters.map((f) => (
          <select
            key={f.label}
            aria-label={f.label}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            className={`field h-9 w-auto py-0 text-[13px] ${
              f.value !== f.options[0].value ? 'border-accent text-accent' : ''
            }`}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}

        {sorts.length > 0 && (
          <select
            aria-label="Sort"
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            className="field h-9 w-auto py-0 text-[13px]"
          >
            {sorts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {dirty && (
          <button type="button" onClick={clear} className="text-[12px] text-faint link-underline hover:text-ink">
            Clear
          </button>
        )}
      </div>

      {count !== undefined && (
        <p className="text-[12px] text-faint tabular-nums">
          {count === total ? `${total} total` : `${count} of ${total}`}
        </p>
      )}
    </div>
  )
}

/** Case-insensitive match across a few fields. */
export function matches(query, ...fields) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.filter(Boolean).join(' ').toLowerCase().includes(needle)
}
