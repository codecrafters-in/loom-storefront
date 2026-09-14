import { Icon } from '../ui/index.jsx'
import { formatMoney, minorUnits, money } from '../../lib/money.js'
import { t } from '../../i18n/index.js'

/**
 * Facets come from the API, never from the rendered page. Deriving them from
 * the current results is the classic catalogue bug: filter to one colour and
 * every other colour disappears, so you can never widen your own search.
 *
 * Generic: every attribute the store marks filterable (`facets.attributes`),
 * every specification marked as a facet (`facets.specs`) and the brands, each
 * under the name the store gave it. The older `sizes` and `colors` lists render
 * only for a backend that sends no attributes — a newer one sends both, and
 * showing both would put Size in the panel twice.
 *
 * Within a group the choices widen (either colour); across groups they narrow
 * (this colour, in this size). That is what the API does with repeated `attr`.
 */
export default function FilterPanel({ facets, value, onChange, onClear, currency, hideBrands = false }) {
  if (!facets) return null
  const { sizes = [], colors = [], tags = [], priceRange, attributes, specs = [], brands = [] } = facets
  const generic = Array.isArray(attributes)

  const toggle = (key, item) => {
    const list = value[key] || []
    onChange({ ...value, [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item], page: 1 })
  }
  const pair = (key, id) => ({ isOn: (name) => value[key]?.includes(`${id}:${name}`), onToggle: (name) => toggle(key, `${id}:${name}`) })

  const active =
    ['sizes', 'colors', 'tags', 'attr', 'spec', 'brand'].reduce((n, key) => n + (value[key]?.length || 0), 0) +
    (value.inStock ? 1 : 0) +
    (value.minPrice != null || value.maxPrice != null ? 1 : 0)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">{t('Filter')}</h2>
        {active > 0 && (
          <button type="button" onClick={onClear} className="text-[12px] text-muted link-underline">
            {t('Clear all ({count})', { count: active })}
          </button>
        )}
      </div>

      {generic ? (
        attributes
          .filter((a) => a.values?.length)
          .map((a) => (
            <Group key={a.id} title={a.name}>
              {a.displayType === 'color' ? (
                <Swatches items={a.values.map((v) => ({ name: v.name, hex: v.color, count: v.count }))} {...pair('attr', a.id)} />
              ) : (
                <Chips items={a.values.map((v) => ({ name: v.name, count: v.count }))} {...pair('attr', a.id)} />
              )}
            </Group>
          ))
      ) : (
        <>
          {sizes.length > 0 && (
            <Group title={t('Size')}>
              <Chips items={sizes.map((name) => ({ name }))} isOn={(s) => value.sizes?.includes(s)} onToggle={(s) => toggle('sizes', s)} />
            </Group>
          )}
          {colors.length > 0 && (
            <Group title={t('Colour')}>
              <Swatches items={colors} isOn={(c) => value.colors?.includes(c)} onToggle={(c) => toggle('colors', c)} />
            </Group>
          )}
        </>
      )}

      {specs
        .filter((s) => s.values?.length)
        .map((s) => (
          <Group key={s.key} title={s.label}>
            <Chips
              items={s.values.map((v) => ({ name: String(v.value), label: s.unit ? `${v.value} ${s.unit}` : null, count: v.count }))}
              {...pair('spec', s.key)}
            />
          </Group>
        ))}

      {!hideBrands && brands.length > 0 && (
        <Group title={t('Brand')}>
          <ul className="space-y-2.5">
            {brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={Boolean(value.brand?.includes(b.slug))}
                    onChange={() => toggle('brand', b.slug)}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="flex-1">{b.name}</span>
                  {b.count != null && <span className="text-[11px] tabular-nums text-faint">{b.count}</span>}
                </label>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {tags.length > 0 && (
        <Group title={facets.tagsLabel || t('Tags')}>
          <Chips small items={tags.map((name) => ({ name }))} isOn={(t) => value.tags?.includes(t)} onToggle={(t) => toggle('tags', t)} />
        </Group>
      )}

      <Group title={t('Availability')}>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={!!value.inStock}
            onChange={(e) => onChange({ ...value, inStock: e.target.checked, page: 1 })}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          {t('In stock only')}
        </label>
      </Group>

      {priceRange && priceRange.max > priceRange.min && (
        <Group title={t('Price')}>
          <PriceRange range={priceRange} currency={currency} value={value} onChange={onChange} />
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

function Chips({ items, isOn, onToggle, small = false }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ name, label, count }) => {
        const on = isOn(name)
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            aria-pressed={on}
            className={`rounded-xs border transition-colors ${
              small ? 'px-2.5 py-1.5 text-[12px] capitalize' : 'h-9 min-w-[2.75rem] px-3 text-[13px]'
            } ${on ? 'border-ink bg-ink text-page' : 'border-line text-ink hover:border-ink'}`}
          >
            {label || name}
            {count != null && <span className={`ms-1.5 text-[11px] tabular-nums ${on ? 'text-page/70' : 'text-faint'}`}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Swatches({ items, isOn, onToggle }) {
  return (
    <ul className="space-y-2.5">
      {items.map((c) => {
        const on = isOn(c.name)
        return (
          <li key={c.name}>
            <button
              type="button"
              onClick={() => onToggle(c.name)}
              aria-pressed={on}
              className="flex w-full items-center gap-2.5 text-start text-[13px]"
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ring-1 ring-inset ${on ? 'ring-2 ring-ink' : 'ring-ink/15'}`}
                style={{ background: c.hex || '#ddd' }}
              >
                {on && <Icon name="check" size={10} className="text-white mix-blend-difference" />}
              </span>
              <span className={`flex-1 ${on ? 'text-ink' : 'text-muted'}`}>{c.name}</span>
              {c.count != null && <span className="text-[11px] tabular-nums text-faint">{c.count}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A lowest and a highest price, in the store's currency.
 *
 * It used to be one slider, the highest, formatted in dollars whatever the
 * store sold in — a shop in rupees showed "$4,999.00" for ₹4,999. The step is a
 * whole major unit, or a hundredth of the spread when that is larger, so a
 * catalogue running from a pen to a phone is not a thousand steps wide.
 */
function PriceRange({ range, currency: given, value, onChange }) {
  // The store's currency, never an assumed dollar: a dinar store's filter reads in KWD, with its three decimals.
  const currency = given || money(0).currency
  const unit = 10 ** minorUnits(currency)
  const step = Math.max(unit, Math.round((range.max - range.min) / 100 / unit) * unit)
  const low = value.minPrice ?? range.min
  const high = value.maxPrice ?? range.max
  const set = (next) => onChange({ ...value, ...next, page: 1 })
  return (
    <>
      <p className="text-[13px] tabular-nums text-muted">
        {formatMoney({ amount: low, currency })} — {formatMoney({ amount: high, currency })}
      </p>
      <label className="mt-3 block text-[12px] text-faint">
        {t('Lowest')}
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={step}
          value={low}
          onChange={(e) => {
            const n = Math.min(Number(e.target.value), high)
            set({ minPrice: n <= range.min ? undefined : n })
          }}
          className="mt-1 w-full accent-[rgb(var(--accent))]"
          aria-label={t('Minimum price')}
        />
      </label>
      <label className="mt-2 block text-[12px] text-faint">
        {t('Highest')}
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={step}
          value={high}
          onChange={(e) => {
            const n = Math.max(Number(e.target.value), low)
            set({ maxPrice: n >= range.max ? undefined : n })
          }}
          className="mt-1 w-full accent-[rgb(var(--accent))]"
          aria-label={t('Maximum price')}
        />
      </label>
    </>
  )
}
