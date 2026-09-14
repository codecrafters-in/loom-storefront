import { useId } from 'react'
import { Icon } from '../ui/index.jsx'
import { formatMoney } from '../../lib/money.js'
import { choiceState, selectionLabel } from '../../lib/variants.js'
import { t } from '../../i18n/index.js'

/**
 * The options, whatever they are.
 *
 * Replaces a colour picker and a size picker that knew their own names. Each
 * option renders the way the store set it up in Odoo — swatches, image tiles,
 * pills, radios or a select — and every choice is in one of four states, worked
 * out in lib/variants.js: available, sold out (struck through, still worth
 * waiting for), never made in this combination (dashed, not worth waiting for),
 * or not bought yet on a dynamic option (offered, and priced by the server).
 *
 * `choice` is what `useProductChoice` returns. `aside(option)` puts something
 * beside an option's name — the size chart link, on the option whose role is
 * size.
 */
export function OptionPicker({ choice, aside }) {
  return choice.model.options.map((option, index) => (
    <OptionField key={option.id} choice={choice} option={option} index={index} aside={aside?.(option)} />
  ))
}

const plusPrice = (c) => (c.priceExtra?.amount > 0 ? ` +${formatMoney(c.priceExtra)}` : '')
const offered = (state) => state === 'available' || state === 'unknown'

function OptionField({ choice: c, option: o, index, aside }) {
  const uid = useId()
  const chosen = o.choices.find((x) => x.id === c.selection[o.id])
  const states = o.choices.map((x) => choiceState(c.model, c.selection, index, x.id))
  // What the earlier options are set to, which is what "not made" is relative to.
  const before = selectionLabel({ options: c.model.options.slice(0, index) }, c.selection)
  const custom = chosen?.custom && <CustomText choice={chosen} value={c.texts[chosen.id] || ''} onChange={(t) => c.setText(chosen.id, t)} />

  if (o.displayType === 'select') {
    const id = `${uid}-select`
    return (
      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-[13px] font-medium">{o.name}</label>
          {aside}
        </div>
        <div className="relative mt-3">
          <select
            id={id}
            value={c.selection[o.id] ?? ''}
            onChange={(e) => e.target.value && c.pickChoice(o.id, e.target.value)}
            className="field h-11 appearance-none pe-9 text-[14px]"
          >
            {!chosen && <option value="">{t('Select {option}', { option: o.name.toLowerCase() })}</option>}
            {o.choices.map((x, k) => (
              <option key={x.id} value={x.id} disabled={!offered(states[k])}>
                {x.name}
                {plusPrice(x)}
                {states[k] === 'sold-out' ? ` — ${t('sold out')}` : states[k] === 'absent' ? ` — ${t('not available')}` : ''}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-faint" />
        </div>
        {custom}
      </div>
    )
  }

  return (
    <fieldset className="relative mt-8">
      <legend className="text-[13px] font-medium">
        {o.name}
        {chosen && <span className="font-normal text-muted">: {chosen.name}</span>}
      </legend>
      {aside && <div className="absolute end-0 top-0">{aside}</div>}

      {o.displayType === 'radio' ? (
        <div className="mt-3 space-y-2">
          {o.choices.map((x, k) => {
            const on = x.id === c.selection[o.id]
            const off = !offered(states[k])
            return (
              <label
                key={x.id}
                className={`flex items-center gap-3 rounded-xs border px-3.5 py-3 text-[14px] transition-colors ${
                  off ? 'cursor-not-allowed border-line text-faint' : on ? 'cursor-pointer border-ink' : 'cursor-pointer border-line hover:border-muted'
                }`}
              >
                <input
                  type="radio"
                  name={`${uid}-radio`}
                  checked={on}
                  disabled={off}
                  onChange={() => c.pickChoice(o.id, x.id)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span className="flex-1">{x.name}</span>
                {/* Hidden from the accessible name, so the radio is called what the
                    choice is called; the price follows the selection anyway. */}
                <span aria-hidden="true" className="text-[13px] tabular-nums text-muted">
                  {off ? (states[k] === 'sold-out' ? t('Sold out') : t('Not available')) : plusPrice(x)}
                </span>
              </label>
            )
          })}
        </div>
      ) : o.displayType === 'color' || o.displayType === 'image' ? (
        <div className="mt-3 flex flex-wrap gap-2.5">
          {o.choices.map((x, k) => {
            const on = x.id === c.selection[o.id]
            const state = states[k]
            const tile = o.displayType === 'image' && x.image?.url
            // Still pressable when sold out: the colour is worth seeing even if
            // it cannot be bought today, and the button says so.
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => c.pickChoice(o.id, x.id)}
                aria-pressed={on}
                title={offered(state) ? x.name : `${x.name} — ${state === 'absent' ? t('not available') : t('sold out')}`}
                className={`relative grid place-items-center overflow-hidden ring-1 ring-inset transition-shadow ${
                  tile ? 'h-14 w-14 rounded-xs' : 'h-11 w-11 rounded-full'
                } ${on ? 'ring-2 ring-ink ring-offset-2 ring-offset-page' : 'ring-ink/15 hover:ring-muted'} ${
                  offered(state) ? '' : 'opacity-45'
                } ${state === 'absent' ? 'outline-dashed outline-1 outline-offset-2 outline-faint' : ''}`}
                style={{ background: x.color || '#ddd' }}
              >
                {tile && <img src={x.image.url} alt="" className="h-full w-full object-cover" />}
                <span className="sr-only">
                  {x.name}
                  {state === 'sold-out' ? ` (${t('sold out')})` : state === 'absent' ? ` (${t('not available')})` : ''}
                </span>
                {state === 'sold-out' && <span aria-hidden="true" className="absolute h-[1.5px] w-8 -rotate-45 bg-ink/60" />}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {o.choices.map((x, k) => {
            const on = x.id === c.selection[o.id]
            const state = states[k]
            return (
              <button
                key={x.id}
                type="button"
                disabled={!offered(state)}
                onClick={() => c.pickChoice(o.id, x.id)}
                aria-pressed={on}
                title={
                  state === 'sold-out'
                    ? (before ? t('{name} is sold out in {selection}', { name: x.name, selection: before }) : t('{name} is sold out', { name: x.name }))
                    : state === 'absent'
                      ? (before ? t('{name} is not made in {selection}', { name: x.name, selection: before }) : t('{name} is not made', { name: x.name }))
                      : undefined
                }
                className={`relative h-12 min-w-[3.5rem] rounded-xs border px-3.5 text-sm transition-colors ${
                  state === 'absent'
                    ? 'cursor-not-allowed border-dashed border-line text-faint/60'
                    : state === 'sold-out'
                      ? 'cursor-not-allowed border-line text-faint'
                      : on
                        ? 'border-ink bg-ink text-page'
                        : 'border-line text-ink hover:border-ink'
                }`}
              >
                {x.name}
                {!offered(state) && (
                  <span className="sr-only">{state === 'sold-out' ? ` — ${t('sold out')}` : ` — ${t('not available in this combination')}`}</span>
                )}
                {/* A struck-through choice reads as "gone"; a dashed outline reads
                    as "not offered". Only the first gets the line. */}
                {state === 'sold-out' && <span aria-hidden="true" className="absolute inset-x-2 top-1/2 h-px -rotate-[18deg] bg-line" />}
              </button>
            )
          })}
        </div>
      )}

      {before && states.includes('absent') && (
        <p className="mt-3 text-[12px] text-faint">{t('Dashed choices are not made in {selection}.', { selection: before })}</p>
      )}
      {custom}
    </fieldset>
  )
}

/**
 * Attributes that do not make variants: an engraving, a gift box, add-ons.
 *
 * Checkboxes when the store allows several, radios when it allows one, with a
 * "None" row when one is not required. A choice the shopper types text for opens
 * a field under itself, capped at the 200 characters the server accepts.
 */
export function ExtraOptions({ choice: c }) {
  const uid = useId()
  return c.model.extras.map((o) => {
    const picked = c.extras[o.id] || []
    const row = 'flex cursor-pointer items-center gap-3 rounded-xs border px-3.5 py-3 text-[14px] transition-colors'
    return (
      <fieldset key={o.id} className="mt-8">
        <legend className="text-[13px] font-medium">
          {o.name}
          {!o.required && <span className="font-normal text-faint"> ({t('optional')})</span>}
        </legend>
        <div className="mt-3 space-y-2">
          {!o.multiple && !o.required && (
            <label className={`${row} ${picked.length ? 'border-line hover:border-muted' : 'border-ink'}`}>
              <input
                type="radio"
                name={`${uid}-${o.id}`}
                checked={!picked.length}
                onChange={() => c.toggleExtra(o.id, null)}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              <span className="flex-1">{t('None')}</span>
            </label>
          )}
          {o.choices.map((x) => {
            const on = picked.includes(x.id)
            return (
              <div key={x.id}>
                <label className={`${row} ${on ? 'border-ink' : 'border-line hover:border-muted'}`}>
                  <input
                    type={o.multiple ? 'checkbox' : 'radio'}
                    name={`${uid}-${o.id}`}
                    checked={on}
                    onChange={() => c.toggleExtra(o.id, x.id)}
                    className="h-4 w-4 accent-[rgb(var(--accent))]"
                  />
                  <span className="flex-1">{x.name}</span>
                  <span aria-hidden="true" className="text-[13px] tabular-nums text-muted">{plusPrice(x)}</span>
                </label>
                {x.custom && on && <CustomText choice={x} value={c.texts[x.id] || ''} onChange={(t) => c.setText(x.id, t)} />}
              </div>
            )
          })}
        </div>
      </fieldset>
    )
  })
}

function CustomText({ choice, value, onChange }) {
  const id = useId()
  return (
    <div className="mt-2">
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted">
        {t('Your {option}', { option: choice.name.toLowerCase() })}
      </label>
      <input id={id} value={value} maxLength={200} onChange={(e) => onChange(e.target.value)} className="field h-10 text-[14px]" />
      <p className="mt-1 text-end text-[11px] tabular-nums text-faint">{value.length}/200</p>
    </div>
  )
}
