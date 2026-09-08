import { Icon } from '../ui/index.jsx'
import { formatMoney } from '../../lib/money.js'

/**
 * Facets come from the API, never from the rendered page. Deriving them from
 * the current results is the classic catalogue bug: filter to one colour and
 * every other colour disappears, so you can never widen your own search.
 */
export default function FilterPanel({ facets, value, onChange, onClear }) {
  if (!facets) return null
  const { sizes = [], colors = [], tags = [], priceRange } = facets

  const toggle = (key, item) => {
    const list = value[key] || []
    onChange({ ...value, [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item], page: 1 })
  }

  const active =
    (value.sizes?.length || 0) + (value.colors?.length || 0) + (value.tags?.length || 0) + (value.inStock ? 1 : 0)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">Filter</h2>
        {active > 0 && (
          <button type="button" onClick={onClear} className="text-[12px] text-muted link-underline">
            Clear all ({active})
          </button>
        )}
      </div>

      <Group title="Size">
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => {
            const on = value.sizes?.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle('sizes', s)}
                aria-pressed={on}
                className={`h-9 min-w-[2.75rem] rounded-xs border px-3 text-[13px] transition-colors ${
                  on ? 'border-ink bg-ink text-page' : 'border-line text-ink hover:border-ink'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
      </Group>

      <Group title="Colour">
        <ul className="space-y-2.5">
          {colors.map((c) => {
            const on = value.colors?.includes(c.name)
            return (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => toggle('colors', c.name)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2.5 text-left text-[13px]"
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ring-inset ${on ? 'ring-2 ring-ink' : 'ring-ink/15'}`}
                    style={{ background: c.hex }}
                  >
                    {on && <Icon name="check" size={10} className="text-white mix-blend-difference" />}
                  </span>
                  <span className={on ? 'text-ink' : 'text-muted'}>{c.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Group>

      {tags.length > 0 && (
        <Group title="Fabric & use">
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => {
              const on = value.tags?.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle('tags', t)}
                  aria-pressed={on}
                  className={`rounded-xs border px-2.5 py-1.5 text-[12px] capitalize transition-colors ${
                    on ? 'border-ink bg-ink text-page' : 'border-line text-muted hover:border-ink hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </Group>
      )}

      <Group title="Availability">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={!!value.inStock}
            onChange={(e) => onChange({ ...value, inStock: e.target.checked, page: 1 })}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          In stock only
        </label>
      </Group>

      {priceRange && (
        <Group title="Price">
          <p className="text-[13px] text-muted">
            {formatMoney({ amount: priceRange.min, currency: 'USD' })} —{' '}
            {formatMoney({ amount: priceRange.max, currency: 'USD' })}
          </p>
          <input
            type="range"
            min={priceRange.min}
            max={priceRange.max}
            step={1000}
            value={value.maxPrice ?? priceRange.max}
            onChange={(e) => onChange({ ...value, maxPrice: Number(e.target.value), page: 1 })}
            className="mt-3 w-full accent-[rgb(var(--accent))]"
            aria-label="Maximum price"
          />
          <p className="mt-1 text-[12px] text-faint">
            Up to {formatMoney({ amount: value.maxPrice ?? priceRange.max, currency: 'USD' })}
          </p>
        </Group>
      )}
    </div>
  )
}

function Group({ title, children }) {
  return (
    <div>
      <h3 className="mb-3.5 text-[13px] font-medium">{title}</h3>
      {children}
    </div>
  )
}
