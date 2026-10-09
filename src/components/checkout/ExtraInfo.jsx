import { t } from '../../i18n/index.js'

/**
 * Odoo's Extra Info checkout step: the fields the merchant put on its form in Odoo's website editor
 * (`checkout.extraInfo`), in their words. Values go back as `extraInfo: { name: value }`.
 */
export default function ExtraInfo({ fields, values, onChange }) {
  const set = (name) => (e) => {
    const value = e.target.type === 'checkbox' ? (e.target.checked ? t('Yes') : '') : e.target.value
    onChange({ ...values, [name]: value })
  }
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.08em]">{t('Extra info')}</h2>
      <div className="space-y-4">
        {fields.map((field, i) => {
          const id = `extra-${i}`
          const common = { id, name: field.name, required: field.required, value: values[field.name] || '', onChange: set(field.name) }
          const label = (
            <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
              {field.label} {!field.required && <span className="font-normal text-faint">{t('(optional)')}</span>}
            </label>
          )
          if (field.type === 'boolean') {
            return (
              <label key={field.name} className="flex items-center gap-2.5 text-[13px] text-muted">
                <input {...common} type="checkbox" value={undefined} checked={Boolean(values[field.name])} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                {field.label}
              </label>
            )
          }
          if (field.options) {
            return (
              <div key={field.name}>
                {label}
                <select {...common} className="field">
                  <option value="" />
                  {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )
          }
          const type = { email: 'email', tel: 'tel', url: 'url', integer: 'number', float: 'number', date: 'date', datetime: 'datetime-local' }[field.type] || 'text'
          return (
            <div key={field.name}>
              {label}
              {field.type === 'text'
                ? <textarea {...common} rows={3} maxLength={4000} placeholder={field.placeholder} className="field" />
                : <input {...common} type={type} step={field.type === 'float' ? 'any' : undefined} placeholder={field.placeholder} className="field" />}
            </div>
          )
        })}
      </div>
    </section>
  )
}
