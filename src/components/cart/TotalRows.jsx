import { formatMoney } from '../../lib/money.js'
import { totalRows } from '../../lib/totals.js'
import { t } from '../../i18n/index.js'

/** A bag's or an order's rows above its total, for inside a `<dl>` (lib/totals.js). */
export default function TotalRows({ bag, fee }) {
  return totalRows(bag, fee).map((row, i) => (
    <div key={i} className={`flex justify-between ${row.off ? 'text-sale' : ''}`}>
      <dt className={row.off ? '' : 'text-muted'}>{t(row.label)}</dt>
      <dd className="tabular-nums">{row.off && '−'}{formatMoney(row.money)}</dd>
    </div>
  ))
}

/** The drawer's rows, the store's tax note and the total. */
export function DrawerTotals({ bag, note }) {
  return (
    <>
      <dl className="space-y-1 text-[13px]">
        <TotalRows bag={bag} />
      </dl>
      {note && <p className="mt-1.5 text-[11px] text-faint">{note}</p>}
      <p className="mt-2.5 flex justify-between border-t border-line pt-2.5 text-[15px] font-medium">
        <span>{t('Total')}</span>
        <span className="tabular-nums">{formatMoney(bag.total)}</span>
      </p>
    </>
  )
}
