import { Icon } from '../ui/index.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { t } from '../../i18n/index.js'
import { promisesGrid } from '../../lib/rows.js'

/** The reassurance strip. Sits above the footer on most pages because the
 *  objections it answers arrive late, not early. */
export default function Promises({ className = '' }) {
  const config = useStorefront()
  const promises = config.promises || []
  if (!promises.length) return null
  return (
    <section aria-label={t('Our promises')} className={`border-y border-line bg-surface ${className}`}>
      <div className={`wrap grid gap-8 py-10 ${promisesGrid(promises.length)}`}>
        {promises.map((p, index) => (
          <div key={`${index}-${p.title}`} className="flex gap-3.5">
            <Icon name={p.icon} size={20} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <h3 className="font-sans text-sm font-medium">{p.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
