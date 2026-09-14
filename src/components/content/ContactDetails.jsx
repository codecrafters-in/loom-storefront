import { t } from '../../i18n/index.js'

/**
 * The store's contact details from Odoo (`store.contact`): on the contact page
 * and, compact, in the footer. Renders nothing when the store has none.
 */
const NETWORKS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
}

export default function ContactDetails({ contact, compact = false, className = '' }) {
  const { email, phone, whatsapp, address = [], hours, social = [] } = contact || {}
  if (!email && !phone && !whatsapp && !address.length && !hours && !social.length) return null
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : null
  const link = 'text-accent link-underline'

  const rows = [
    email && [t('Email'), <a key="email" href={`mailto:${email}`} className={link}>{email}</a>],
    phone && [t('Phone'), <a key="phone" href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={link}>{phone}</a>],
    whatsappUrl && ['WhatsApp', <a key="wa" href={whatsappUrl} className={link} target="_blank" rel="noopener noreferrer">{whatsapp}</a>],
    hours && [t('Hours'), hours],
    !compact && address.length > 0 && [t('Address'), <span key="address">{address.map((line) => <span key={line} className="block">{line}</span>)}</span>],
    social.length > 0 && [t('Follow'), (
      <span key="social" className="flex flex-wrap gap-x-3 gap-y-1">
        {social.map((s) => (
          <a key={s.network} href={s.url} className={link} target="_blank" rel="noopener noreferrer me">{NETWORKS[s.network] || s.network}</a>
        ))}
      </span>
    )],
  ].filter(Boolean)

  return (
    <dl className={`${compact ? 'space-y-1.5 text-[13px]' : 'mt-5 space-y-3 text-[15px]'} ${className}`}>
      {rows.map(([label, value]) => (
        <div key={label} className={compact ? 'flex gap-2' : 'grid gap-1 sm:grid-cols-[7rem_1fr]'}>
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
