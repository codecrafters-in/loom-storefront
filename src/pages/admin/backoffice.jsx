import { useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, ErrorState, Icon, Skeleton } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'

/*
 * Store settings and bulk import and export against a live store.
 *
 * The backend (Odoo, for a LOOM Storefront store) holds the settings and the catalogue; these screens are a
 * convenience over them. Settings send only what changed, and a setting the backend does not let this screen change
 * is refused by name, never dropped quietly. Imports are checked first and saved only when asked.
 */

const FEATURES = [
  ['wishlist', 'Wishlist'],
  ['reviews', 'Reviews'],
  ['questions', 'Questions on product pages'],
  ['stockAlerts', 'Back-in-stock alerts'],
  ['search', 'Search'],
  ['accounts', 'Customer accounts'],
  ['quotes', 'Quote requests'],
  ['discountCodes', 'Discount codes'],
  ['newsletter', 'Newsletter'],
  ['recentlyViewed', 'Recently viewed'],
  ['blog', 'Blog'],
]

const GROUPS = [
  {
    title: 'Store',
    note: 'Shown in the header, footer, page titles and emails.',
    fields: [
      { path: 'store.name', label: 'Store name' },
      { path: 'store.tagline', label: 'Tagline' },
      { path: 'store.description', label: 'Description', type: 'textarea', hint: 'What search engines show when a page has no description of its own.' },
      { path: 'store.email', label: 'Contact email', type: 'email' },
    ],
  },
  {
    title: 'Prices and returns',
    fields: [
      { path: 'pricing.locale', label: 'Locale for dates and numbers', mono: true, hint: 'For example en-IN or de-DE.' },
      { path: 'pricing.showTaxNote', label: 'Show the tax note under prices', type: 'toggle' },
      { path: 'pricing.taxNote', label: 'Tax note' },
      { path: 'commerce.returnsWindowDays', label: 'Returns window (days)', type: 'number' },
    ],
  },
  {
    title: 'Stock',
    fields: [
      {
        path: 'commerce.stock.display',
        label: 'Show stock',
        type: 'select',
        options: [['exact', 'Exact quantity'], ['low', 'Only when running low'], ['hidden', 'In stock or sold out only']],
      },
      { path: 'commerce.stock.lowThreshold', label: 'Running low at', type: 'number' },
      { path: 'commerce.stock.hideSoldOut', label: 'Leave sold-out products out of listings', type: 'toggle' },
    ],
  },
  {
    title: 'Features',
    note: 'Turning one off removes its buttons and links from the storefront.',
    fields: FEATURES.map(([key, label]) => ({ path: `features.${key}`, label, type: 'toggle' })),
  },
]

const readPath = (doc, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), doc)

/** `{'store.name': 'x'}` → `{store: {name: 'x'}}`. */
function nest(changes) {
  const body = {}
  for (const [path, value] of Object.entries(changes)) {
    const keys = path.split('.')
    let node = body
    keys.slice(0, -1).forEach((key) => {
      node[key] = node[key] || {}
      node = node[key]
    })
    node[keys.at(-1)] = value
  }
  return body
}

function Section({ title, note, children }) {
  return (
    <section className="rounded-xs border border-line bg-surface p-5">
      <h2 className="text-[14px] font-medium">{title}</h2>
      {note && <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{note}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Field({ field, value, onChange, disabled }) {
  const id = `setting-${field.path.replace(/\./g, '-')}`
  if (field.type === 'toggle') {
    return (
      <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
        <input id={id} type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]" />
        {field.label}
      </label>
    )
  }
  const common = { id, disabled, className: `field ${field.mono ? 'font-mono text-[13px]' : ''}` }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{field.label}</label>
      {field.type === 'textarea' ? (
        <textarea {...common} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'select' ? (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {field.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      ) : (
        <input
          {...common}
          type={field.type || 'text'}
          min={field.type === 'number' ? 0 : undefined}
          value={value ?? ''}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value || 0) : e.target.value)}
        />
      )}
      {field.hint && <p className="mt-1 text-[12px] text-faint">{field.hint}</p>}
    </div>
  )
}

export function LiveSettings() {
  const { data, error, loading, reload } = useAsync(() => api.adminGetSettings(), [])
  const [changes, setChanges] = useState({})
  const [busy, setBusy] = useState(false)
  const { push } = useToast()

  if (error) return <ErrorState error={error} onRetry={reload} />
  if (loading || !data) return <Skeleton className="h-96 w-full" />

  const admin = data.admin || {}
  const editable = admin.editable ? new Set(admin.editable) : null
  const canEdit = admin.canEdit !== false
  const valueOf = (path) => (path in changes ? changes[path] : readPath(data, path))
  const change = (path, value) =>
    setChanges((current) => {
      const next = { ...current }
      if (value === readPath(data, path)) delete next[path]
      else next[path] = value
      return next
    })
  const dirty = Object.keys(changes).length > 0

  const save = async () => {
    setBusy(true)
    try {
      await api.adminUpdateSettings(nest(changes))
      push('Saved — the storefront shows it on its next load')
      setChanges({})
      reload()
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-display-md">Storefront</h1>
        {dirty && (
          <div className="flex gap-3">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setChanges({})}>Discard</Button>
          </div>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        The settings you change most. Everything else about the store — theme, navigation, home page, pages, payments
        and shipping — is set on the store in Odoo.
        {admin.backendUrl && (
          <>
            {' '}
            <a href={admin.backendUrl} target="_blank" rel="noreferrer" className="link-underline">Open the store in Odoo</a>
          </>
        )}
      </p>
      {!canEdit && (
        <p className="mt-4 max-w-2xl rounded-xs border border-line bg-sunken p-3 text-[13px] text-muted">
          You can look but not change: store settings are for storefront managers in Odoo.
        </p>
      )}

      <div className="mt-8 max-w-2xl space-y-8">
        {GROUPS.map((group) => {
          const fields = group.fields.filter((field) => !editable || editable.has(field.path))
          return fields.length ? (
            <Section key={group.title} title={group.title} note={group.note}>
              {fields.map((field) => (
                <Field key={field.path} field={field} value={valueOf(field.path)} disabled={!canEdit}
                  onChange={(value) => change(field.path, value)} />
              ))}
            </Section>
          ) : null
        })}
        <EmailAndKeys />
      </div>
    </>
  )
}

/** A test email through the backend's own mail server, and where payment keys and mail passwords are kept instead. */
function EmailAndKeys() {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const { push } = useToast()
  const keys = useAsync(
    () => api.adminGetCredentials().then(() => null, (err) => (err.code === 'use_odoo_backend' ? err : Promise.reject(err))),
    [],
  )
  const links = keys.data?.detail?.detail?.links

  const send = async () => {
    setSending(true)
    try {
      setResult(await api.adminSendTestNotification({}))
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <Section title="Email and keys" note="Emails go out through Odoo's mail server, in the store's look.">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="quiet" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send me a test email'}</Button>
        {result && (
          <span className={`text-[12px] ${result.delivered ? 'text-good' : 'text-sale'}`}>
            {result.delivered ? `Sent to ${result.preview?.to}` : `Not sent — ${result.message}`}
          </span>
        )}
      </div>
      {keys.data && (
        <div className="text-[13px] leading-relaxed text-muted">
          <p>{keys.data.message}</p>
          {links && (
            <p className="mt-2 flex flex-wrap gap-4">
              {links.payments && <a href={links.payments} target="_blank" rel="noreferrer" className="link-underline">Payment providers</a>}
              {links.mail && <a href={links.mail} target="_blank" rel="noreferrer" className="link-underline">Outgoing mail servers</a>}
            </p>
          )}
        </div>
      )}
    </Section>
  )
}

/* ── import and export ─────────────────────────────────────────────────── */

const CSV_COLUMNS = 'slug, title, subtitle, description, published, categories, tags, price, compare_at_price, option1_name … option3_value, sku, variant_price, inventory, images, specs'

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

const today = () => new Date().toISOString().slice(0, 10)

function Report({ report, title }) {
  const errors = report.errors || []
  return (
    <div className="rounded-xs border border-line bg-surface p-5" role="status">
      <h2 className="text-[14px] font-medium">{title}</h2>
      <p className="mt-2 text-[13px] text-muted">
        {report.created} new · {report.updated} updated · {report.categories} categories
        {errors.length ? ` · ${errors.length} problem${errors.length === 1 ? '' : 's'}` : ''}
      </p>
      {errors.length > 0 && (
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-[12px]">
          {errors.map((error, index) => (
            <li key={index} className="text-sale">
              {error.row ? `Row ${error.row}` : error.index ? `Product ${error.index}` : error.category ? `Category ${error.category}` : ''}
              {error.slug ? ` (${error.slug})` : ''}: {error.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function LiveData() {
  const { push } = useToast()
  const [busy, setBusy] = useState(null)
  const [checked, setChecked] = useState(null)
  const [done, setDone] = useState(null)

  const exportCsv = async () => {
    setBusy('csv')
    try {
      download(await api.adminExport({ format: 'csv' }), `catalog-${today()}.csv`, 'text/csv')
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const exportJson = async () => {
    setBusy('json')
    try {
      const all = { products: [], categories: [], collections: [] }
      for (let page = 1; ; page += 1) {
        const chunk = await api.adminExport({ page, perPage: 200 })
        if (page === 1) all.categories = chunk.categories || []
        all.products.push(...(chunk.products || []))
        if (!chunk.products?.length || all.products.length >= chunk.total) break
      }
      download(JSON.stringify(all, null, 2), `catalog-${today()}.json`, 'application/json')
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const choose = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy('check')
    setDone(null)
    try {
      const text = await file.text()
      const body = /\.csv$/i.test(file.name) ? { csv: text } : { mode: 'merge', ...JSON.parse(text) }
      const report = await api.adminImport({ ...body, dry_run: true })
      setChecked({ name: file.name, body, report })
    } catch (err) {
      push(err.message || 'That file could not be read.', { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const importNow = async () => {
    setBusy('import')
    try {
      const report = await api.adminImport(checked.body)
      setDone(report)
      setChecked(null)
      push(`Imported ${report.created} new and ${report.updated} updated products`)
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <h1 className="text-display-md">Import and export</h1>
      <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
        A spreadsheet of the catalogue, one row per variant. An import goes through the same checks as the product
        editor: products are matched by slug, and nothing is ever deleted.
      </p>

      <div className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
        <section className="rounded-xs border border-line bg-surface p-5">
          <h2 className="text-[14px] font-medium">Export</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">Every product, published or not.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" icon="package" onClick={exportCsv} disabled={Boolean(busy)}>{busy === 'csv' ? 'Preparing…' : 'Download CSV'}</Button>
            <Button size="sm" variant="quiet" onClick={exportJson} disabled={Boolean(busy)}>{busy === 'json' ? 'Preparing…' : 'JSON'}</Button>
          </div>
        </section>

        <section className="rounded-xs border border-line bg-surface p-5">
          <h2 className="text-[14px] font-medium">Import</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">A CSV or JSON file. It is checked first; nothing is saved until you say so.</p>
          <label className="mt-4 inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-line bg-surface px-3.5 text-[13px] transition-colors hover:border-ink">
            <Icon name="refresh" size={15} />
            {busy === 'check' ? 'Checking…' : 'Choose a file'}
            <input type="file" accept=".csv,text/csv,application/json" onChange={choose} className="sr-only" disabled={Boolean(busy)} />
          </label>
        </section>
      </div>

      <div className="mt-6 max-w-2xl space-y-4">
        {checked && (
          <>
            <Report report={checked.report} title={`Checked ${checked.name}`} />
            <div className="flex flex-wrap gap-3">
              <Button size="sm" onClick={importNow} disabled={Boolean(busy) || checked.report.products === 0}>
                {busy === 'import' ? 'Importing…' : 'Import now'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChecked(null)}>Cancel</Button>
            </div>
          </>
        )}
        {done && <Report report={done} title="Imported" />}
        <p className="text-[12px] leading-relaxed text-faint">Columns: {CSV_COLUMNS}. Lists (categories, tags, images) are separated with |, specs are written key=value|key=value.</p>
      </div>
    </>
  )
}
