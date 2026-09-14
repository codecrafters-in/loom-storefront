import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import Seo from '../components/Seo.jsx'
import { Button, Empty, ErrorState, Icon, Price, Skeleton } from '../components/ui/index.jsx'
import Media from '../components/ui/Media.jsx'
import { SIZES } from '../lib/images.js'
import { attributeByKey, attributeGroups } from '../data/attributes.js'
import { optionsOf } from '../lib/variants.js'
import { COMPARE_LIMIT, toggleCompare } from '../lib/compare.js'
import { useCompared } from '../components/product/CompareTray.jsx'
import { t } from '../i18n/index.js'

/**
 * Up to four products, side by side, a row per fact.
 *
 * The list is in the URL (`?slugs=a,b`), so a comparison can be sent to
 * somebody; without one, the comparison saved in this browser is shown.
 * Products are read afresh rather than from what was saved, because a price in a
 * comparison is only worth reading if it is today's.
 *
 * The specification rows are the union of every product's, grouped the way the
 * store grouped them, with a dash where a product has no value. Leaving a row
 * out for one product would line up its weight against another's battery.
 *
 * Its own chunk, and not prerendered: it is different for every visitor.
 */
export default function Compare() {
  const [params, setParams] = useSearchParams()
  const saved = useCompared()
  const fromUrl = (params.get('slugs') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const slugs = [...new Set(fromUrl.length ? fromUrl : saved)].slice(0, COMPARE_LIMIT)

  const { data, error, loading, reload } = useAsync(
    // A product that has gone is left out rather than failing the whole table.
    () => Promise.all(slugs.map((s) => api.getProduct(s).catch((err) => (err.status === 404 ? null : Promise.reject(err))))),
    [slugs.join(',')],
  )
  const products = (data || []).filter(Boolean)

  const remove = (slug) => {
    if (saved.includes(slug)) toggleCompare(slug)
    const next = slugs.filter((s) => s !== slug)
    setParams(next.length ? { slugs: next.join(',') } : {}, { replace: true })
  }

  const { groups, valueOf } = specRows(products)
  const optionNames = [...new Set(products.flatMap((p) => optionsOf(p).map((o) => o.name)))]

  return (
    <>
      <Seo title={t('Compare')} noindex />
      <div className="wrap py-10">
        <h1 className="text-display-lg">{t('Compare')}</h1>
        {products.length > 0 && (
          <p className="mt-3 text-[15px] text-muted">
            {t('{count} of up to {limit} products, side by side.', { count: products.length, limit: COMPARE_LIMIT })}
          </p>
        )}
      </div>

      <div className="wrap pb-20">
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && slugs.length ? (
          <Skeleton className="h-96 w-full" />
        ) : !products.length ? (
          <Empty
            icon="search"
            title={t('Nothing to compare yet')}
            body={t('Press Compare on up to four products and they line up here.')}
            action={<Button to="/shop" size="lg">{t('Browse the shop')}</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed border-collapse text-start text-[13px]">
              <caption className="sr-only">{t('The products being compared, one column each')}</caption>
              <colgroup>
                <col className="w-36" />
                {products.map((p) => (
                  <col key={p.slug} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <td />
                  {products.map((p) => (
                    <th key={p.slug} scope="col" className="px-3 pb-6 align-top font-normal">
                      <Link to={`/product/${p.slug}`} className="block">
                        <span className="shot block overflow-hidden rounded-xs">
                          <Media src={p.images[0]?.url} provider={p.images[0]?.provider} type={p.images[0]?.type} alt="" sizes={SIZES.card} className="h-full w-full object-cover" />
                        </span>
                      </Link>
                      <Link to={`/product/${p.slug}`} className="mt-3 block text-[14px] font-medium leading-snug">
                        {p.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(p.slug)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-faint transition-colors hover:text-sale"
                      >
                        <Icon name="close" size={12} /> {t('Remove')}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label={t('Price')} cells={products.map((p) => <Price key={p.slug} price={p.price} compareAt={p.compareAtPrice} size="sm" />)} />
                <Row label={t('Brand')} cells={products.map((p) => p.brand?.name || '—')} />
                <Row label={t('Rating')} cells={products.map((p) => (p.rating?.count ? t('{average} of 5 ({count})', { average: p.rating.average, count: p.rating.count }) : '—'))} />
                <Row label={t('Availability')} cells={products.map((p) => (p.variants.some((v) => v.available) ? t('In stock') : t('Sold out')))} />
                {optionNames.map((name) => (
                  <Row
                    key={`option-${name}`}
                    label={name}
                    cells={products.map((p) => optionsOf(p).find((o) => o.name === name)?.choices.map((c) => c.name).join(', ') || '—')}
                  />
                ))}
                {groups.map((g) => [
                  <tr key={`group-${g.label}`}>
                    <th colSpan={products.length + 1} scope="colgroup" className="eyebrow pb-2 pt-8 text-start font-normal">
                      {g.label}
                    </th>
                  </tr>,
                  ...g.rows.map(([key, label]) => (
                    <Row key={`spec-${key}`} label={label} cells={products.map((p) => valueOf.get(`${p.slug}|${key}`) || '—')} />
                  )),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

function Row({ label, cells }) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-3 pe-3 align-top text-[12px] font-normal text-faint">{label}</th>
      {cells.map((cell, i) => (
        <td key={i} className="break-words px-3 py-3 align-top">{cell}</td>
      ))}
    </tr>
  )
}

/**
 * Specification rows across products: the store's `specList` when a product
 * has one, the bundled vocabulary for a bare `specs` map.
 */
function specRows(products) {
  const groups = new Map()
  const valueOf = new Map()
  const add = (groupId, groupLabel, key, label, slug, value) => {
    const group = groups.get(groupId) || { label: groupLabel, rows: new Map() }
    if (!group.rows.has(key)) group.rows.set(key, label)
    groups.set(groupId, group)
    valueOf.set(`${slug}|${key}`, value)
  }
  for (const p of products) {
    if (p.enrichment?.specList?.length) {
      for (const s of p.enrichment.specList) {
        add(s.group || 'general', s.groupLabel || s.group || t('General'), s.key, s.label || s.key, p.slug, s.unit ? `${s.value} ${s.unit}` : String(s.value))
      }
      continue
    }
    for (const [key, value] of Object.entries(p.enrichment?.specs || {})) {
      const a = attributeByKey[key]
      const group = a?.group || 'general'
      add(group, attributeGroups.find((g) => g.id === group)?.label || t('General'), key, a ? `${a.label}${a.unit ? ` (${a.unit})` : ''}` : key, p.slug, String(value))
    }
  }
  return { groups: [...groups.values()].map((g) => ({ label: g.label, rows: [...g.rows] })), valueOf }
}
