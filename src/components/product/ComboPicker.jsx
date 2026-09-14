import { useId } from 'react'
import Media from '../ui/Media.jsx'
import { SIZES } from '../../lib/images.js'
import { formatMoney } from '../../lib/money.js'

/**
 * Choosing a set: one item from each group.
 *
 * Every item says what it adds to the price — "Included" or "+$6.00" — and the
 * total follows underneath, because a set whose price changes when a pen's
 * finish does is only honest if the change is visible at the moment of
 * choosing. A sold-out item is shown and cannot be picked, so the group still
 * reads as the choice it is.
 *
 * Its own chunk: most product pages are not sets, and a shopper on one of those
 * should not download this.
 */
export default function ComboPicker({ groups = [], picks = {}, onPick, total }) {
  const uid = useId()
  return (
    <>
      {groups.map((g) => (
        <fieldset key={g.id} className="mt-8">
          <legend className="text-[13px] font-medium">{g.name}</legend>
          <div className="mt-3 space-y-2">
            {g.items.map((item) => {
              const on = picks[g.id] === item.id
              const options = Object.values(item.options || {}).filter(Boolean).join(', ')
              return (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 rounded-xs border p-2.5 transition-colors ${
                    item.available === false ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  } ${on ? 'border-ink' : 'border-line hover:border-muted'}`}
                >
                  <input
                    type="radio"
                    name={`${uid}-${g.id}`}
                    checked={on}
                    disabled={item.available === false}
                    onChange={() => onPick(g.id, item.id)}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="w-12 shrink-0">
                    <span className="shot block overflow-hidden rounded-xs">
                      <Media src={item.image?.url} alt="" sizes={SIZES.thumb} loading="lazy" className="h-full w-full object-cover" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-snug">{item.title}</span>
                    {options && <span className="block text-[12px] text-faint">{options}</span>}
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">
                    {item.available === false ? 'Sold out' : item.extraPrice?.amount > 0 ? `+${formatMoney(item.extraPrice)}` : 'Included'}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
      {total && (
        <p className="mt-4 flex justify-between border-t border-line pt-3 text-[14px]">
          <span className="text-muted">Set total</span>
          <span className="tabular-nums">{formatMoney(total)}</span>
        </p>
      )}
    </>
  )
}
