import { Link } from 'react-router-dom'
import Media from '../ui/Media.jsx'
import { formatMoney } from '../../lib/money.js'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { t } from '../../i18n/index.js'

/**
 * The drawer's "goes with this" rail, keyed on the last line added so the suggestions follow what the shopper is
 * actually buying. The anchor's accessories come first when the store chose some: "frequently bought together" is
 * the merchant's answer and a better one than a computed guess. The product read is cached, and usually already is
 * from the page the shopper added it on. Nothing is asked while the drawer is closed.
 */
export default function DrawerSuggestions({ open, anchor, rec, close }) {
  const suggestions = useAsync(
    async () => {
      const limit = rec.limit || 3
      const product = await api.getProduct(anchor).catch(() => null)
      const accessories = product?.accessories || []
      if (accessories.length) return { items: accessories.slice(0, limit), accessories: true }
      return api.getRelated(anchor, { limit, strategy: rec.strategy || 'same-category' })
    },
    [anchor, rec.limit, rec.strategy],
    { skip: !open },
  )
  if (!suggestions.data?.items?.length) return null
  return (
    <div className="border-t border-line px-5 py-3">
      <p className="eyebrow">{suggestions.data.accessories ? t('Frequently bought together') : rec.title || t('Goes with this')}</p>
      {/*
        Chips, not cards. Three 4:5 cards with a name and a price
        under each is 210px — a third of a phone screen given to
        things the shopper has not chosen, directly above the total
        they came to check. Laid on their side the same three
        suggestions cost about 90px and are no harder to read, because
        a 40px thumbnail is plenty to recognise something you were
        just looking at.
      */}
      <ul className="no-scrollbar -mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1">
        {suggestions.data.items.map((p) => (
          <li key={p.slug} className="w-[12.5rem] shrink-0">
            <Link
              to={`/product/${p.slug}`}
              onClick={close}
              className="flex items-center gap-2.5 rounded-xs border border-line p-1.5 transition-colors hover:border-ink"
            >
              <span className="w-10 shrink-0">
                <span className="shot block overflow-hidden rounded-xs bg-sunken">
                  <Media
                    src={(p.images?.[0] || p.image)?.url}
                    type={p.images?.[0]?.type}
                    alt={(p.images?.[0] || p.image)?.alt || p.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] leading-snug" title={p.title}>
                  {p.title}
                </span>
                <span className="mt-0.5 block text-[12px] tabular-nums text-faint">
                  {formatMoney(p.price)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
