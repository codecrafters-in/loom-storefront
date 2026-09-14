import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api/index.js'
import { formatMoney } from '../../lib/money.js'
import { t } from '../../i18n/index.js'

/**
 * What the header search box offers while a shopper types (`GET /search/suggest`): products, categories and brands.
 *
 * The input stays in the header and is the combobox; this is its listbox, loaded the first time somebody types. Arrow
 * keys move through the options (announced through `aria-activedescendant`), Enter opens one, Escape closes the list,
 * and Enter with nothing chosen still searches, as before.
 */
export default function SearchSuggest({ q, listId, keysRef, onActive, onClose }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const term = q.trim()
    let alive = true
    // A pause in typing, not every key.
    const timer = setTimeout(() => {
      api.suggestSearch(term, { limit: 5 }).then((next) => alive && setData(next)).catch(() => alive && setData(null))
    }, 180)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q])

  const options = useMemo(() => {
    if (!data) return []
    return [
      ...data.products.map((p) => ({ key: `p-${p.slug}`, to: `/product/${p.slug}`, label: p.title, image: p.image, price: p.price })),
      ...data.categories.map((c) => ({ key: `c-${c.slug}`, to: `/shop/${c.slug}`, label: c.name, note: t('Category') })),
      ...data.brands.map((b) => ({ key: `b-${b.slug}`, to: `/brands/${b.slug}`, label: b.name, note: t('Brand') })),
    ]
  }, [data])

  useEffect(() => setActive(-1), [options])
  useEffect(() => {
    onActive?.(active >= 0 ? `${listId}-${active}` : undefined)
  }, [active, listId, onActive])
  useEffect(() => () => onActive?.(undefined), [onActive])

  keysRef.current = (event) => {
    if (event.key === 'Escape') return onClose()
    if (!options.length) return undefined
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      navigate(options[active].to)
      onClose()
    }
    return undefined
  }

  if (!options.length) return null

  return (
    <ul
      id={listId}
      role="listbox"
      aria-label={t('Suggestions')}
      className="absolute start-0 top-full z-50 mt-1 w-80 max-w-[90vw] rounded-xs border border-line bg-page p-1 shadow-panel"
    >
      {options.map((option, index) => (
        <li key={option.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
          <Link
            to={option.to}
            tabIndex={-1}
            // Keep focus in the input, so the list does not close before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
            className={`flex items-center gap-3 rounded-xs px-2.5 py-2 text-sm hover:bg-sunken ${index === active ? 'bg-sunken' : ''}`}
          >
            {option.image?.url && <img src={option.image.url} alt="" loading="lazy" className="h-9 w-9 flex-none rounded-xs object-cover" />}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.price && <span className="text-[13px] text-muted tabular-nums">{formatMoney(option.price)}</span>}
            {option.note && <span className="text-[12px] text-faint">{option.note}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
