import { Link } from 'react-router-dom'
import { Icon } from '../ui/index.jsx'
import { t } from '../../i18n/index.js'

/** A section's eyebrow and title, with its "See all" link at the right on tablets and up. */
export default function SectionHead({ eyebrow, title, ctaLabel, ctaTo }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        {/* Without a title there is no heading, rather than an empty one a screen reader announces. */}
        {title && <h2 className={`text-display-md ${eyebrow ? 'mt-3' : ''}`}>{title}</h2>}
      </div>
      {ctaTo && (
        <Link to={ctaTo} className="hidden shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink sm:inline-flex">
          {ctaLabel || t('See all')} <Icon name="arrow-right" size={15} className="rtl:-scale-x-100" />
        </Link>
      )}
    </div>
  )
}
