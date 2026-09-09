import { useMemo, useState } from 'react'
import { Button, Icon } from '../ui/index.jsx'
import {
  ProductHighlights,
  ProductAssurances,
  ProductMaker,
  FeatureCarousel,
  SpecCarousel,
  ManufacturerRows,
} from '../product/Enrichment.jsx'
import { attributeByKey, attributeGroups } from '../../data/attributes.js'

/**
 * The enrichment editor, with the storefront rendering beside it.
 *
 * The preview is the point. Key/value editing is the part of a PIM everyone
 * fills in badly, because a form gives no sense of what six highlights look
 * like next to each other or how a sentence wraps in a feature card. Putting
 * the real component alongside turns "is this too long" from a guess into a
 * glance — and it is the real component, not a mock-up, so it cannot drift.
 *
 * Keys come from `attributes.js` as suggestions in a datalist. Typing over them
 * is allowed: a closed list produces a merchandiser who cannot describe what
 * they are selling, and no list at all produces "Fabric", "fabric", "Material"
 * and "Composition" as four separate attributes nobody can filter on.
 */
export default function EnrichmentTab({ draft, set, attributes = [], icons = [], assuranceTemplates = [] }) {
  const e = useMemo(() => draft.enrichment || {}, [draft.enrichment])
  const [section, setSection] = useState('highlights')

  const setE = (key, value) => set(`enrichment.${key}`, value)
  const setMaker = (key, value) => setE('maker', { ...(e.maker || {}), [key]: value })

  const specRows = useMemo(() => Object.entries(e.specs || {}), [e.specs])

  const preview = useMemo(
    () => ({ ...draft, enrichment: { highlights: [], features: [], specs: {}, ...e } }),
    [draft, e],
  )

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-8">
        <div className="flex flex-wrap gap-2">
          {[
            ['highlights', 'Highlights'],
            ['features', 'Features'],
            ['comes-with', 'Comes with'],
            ['specs', 'Specifications'],
            ['manufacturer', 'Manufacturer info'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`rounded-xs border px-3 py-1.5 text-[13px] transition-colors ${
                section === id ? 'border-ink bg-ink text-page' : 'border-line text-muted hover:border-ink hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {section === 'highlights' && (
          <Panel
            title="Highlights"
            note="Six pairs, above the fold, next to the buy button. This is the scan — a shopper deciding in two seconds whether to keep reading. More than six and it stops being a scan and becomes the specifications table."
          >
            <PairEditor
              rows={e.highlights || []}
              attributes={attributes.filter((a) => a.highlight)}
              allAttributes={attributes}
              onChange={(rows) => setE('highlights', rows)}
              warnAfter={6}
            />
          </Panel>
        )}

        {section === 'features' && (
          <Panel
            title="Features"
            note="The two or three things that make this piece different, in your own words. An icon, a short title, and a sentence that says something a competitor could not copy-paste."
          >
            <FeatureEditor items={e.features || []} icons={icons} onChange={(items) => setE('features', items)} />
          </Panel>
        )}

        {section === 'comes-with' && (
          <div className="space-y-8">
            <Panel
              title="Comes with"
              note="What happens after the sale — returns, exchange, repair, payment. It sits under the buy button because that is where the doubt arrives. Leave it empty and the product falls back to the store-wide rows in Settings, which is usually what you want; add rows here only where this piece differs."
            >
              <AssuranceEditor
                rows={e.assurances || []}
                icons={icons}
                templates={assuranceTemplates}
                onChange={(rows) => setE('assurances', rows)}
              />
            </Panel>

            <Panel
              title="Made by"
              note="The mill, workshop or supplier, where they are happy to be named. On a marketplace this block is the seller and their rating; on an own-brand store the seller is never in doubt and the mill is the thing a shopper paying a premium is actually buying. Leave the name empty and the block does not render."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" placeholder="Veshti Mills" value={e.maker?.name || ''} onChange={(v) => setMaker('name', v)} />
                <Field label="Location" placeholder="Erode, Tamil Nadu" value={e.maker?.location || ''} onChange={(v) => setMaker('location', v)} />
                <Field label="Working with us since" placeholder="2019" value={e.maker?.since || ''} onChange={(v) => setMaker('since', v)} />
                <Field label="Rating out of 5" placeholder="4.7" value={e.maker?.rating || ''} onChange={(v) => setMaker('rating', v)} />
                <Field label="Number of ratings" placeholder="312" value={e.maker?.ratingCount || ''} onChange={(v) => setMaker('ratingCount', v)} />
              </div>
              <div className="mt-4">
                <label htmlFor="maker-note" className="mb-1.5 block text-[13px] font-medium">Note</label>
                <textarea
                  id="maker-note"
                  rows={3}
                  className="field"
                  placeholder="A 90-loom weaving house that has been making oxford cloth since 1978."
                  value={e.maker?.note || ''}
                  onChange={(ev) => setMaker('note', ev.target.value)}
                />
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-faint">
                A rating here is a claim about a third party. Publish one only if you can point at
                what it is averaged from — an invented supplier score is the fastest way to make
                every other number on the page look invented too.
              </p>
            </Panel>
          </div>
        )}

        {section === 'specs' && (
          <Panel
            title="Specifications"
            note="The full table, below the fold, grouped automatically by attribute. Nobody reads it end to end; everybody uses it to check one thing."
          >
            <SpecEditor
              rows={specRows}
              attributes={attributes}
              onChange={(rows) => setE('specs', Object.fromEntries(rows.filter(([k]) => k)))}
            />
          </Panel>
        )}

        {section === 'manufacturer' && (
          <Panel
            title="Manufacturer info"
            note="Legally required on a listing in several markets — India's Legal Metrology rules mandate the manufacturer and packer address, the country of origin and the net quantity. Treat it as compliance, not marketing."
          >
            <div className="space-y-4">
              {[
                ['genericName', 'Generic name', 'T-shirts'],
                ['countryOfOrigin', 'Country of origin', 'India'],
                ['manufacturer', 'Manufacturer name and address', ''],
                ['packer', 'Packer name and address', ''],
                ['importer', 'Importer name and address', 'Not applicable'],
                ['netQuantity', 'Net quantity', '1'],
                ['packOf', 'Pack of', '1'],
              ].map(([key, label, placeholder]) => (
                <Field
                  key={key}
                  label={label}
                  placeholder={placeholder}
                  value={e.manufacturer?.[key] || ''}
                  onChange={(v) => setE('manufacturer', { ...(e.manufacturer || {}), [key]: v })}
                />
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/*
        The real components, at the width they ship at.

        Every one of these blocks now renders in the ~30rem column beside the
        buy button, so a narrow rail is the honest preview — which it was not
        while the specification table and the feature cards were a full-width
        section below the fold.
      */}
      <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
        <p className="eyebrow">Live preview</p>
        <div className="mt-3 overflow-hidden rounded-xs border border-line bg-page p-5">
          {section === 'highlights' &&
            (e.highlights?.length ? (
              <ProductHighlights enrichment={e} />
            ) : (
              <Blank>Add a pair and it appears here, exactly as a shopper sees it.</Blank>
            ))}

          {section === 'comes-with' &&
            (e.assurances?.length || e.maker?.name ? (
              <>
                <ProductAssurances product={preview} />
                <ProductMaker enrichment={e} />
              </>
            ) : (
              <Blank>
                Nothing product-specific yet — the storefront falls back to the store-wide rows
                from Settings.
              </Blank>
            ))}

          {section === 'features' &&
            (e.features?.length ? (
              <FeatureCarousel items={e.features} />
            ) : (
              <Blank>Add a feature and the card appears here.</Blank>
            ))}

          {section === 'specs' &&
            (specRows.length ? (
              <SpecCarousel specs={e.specs} />
            ) : (
              <Blank>Add a row and the table appears here, grouped.</Blank>
            ))}

          {section === 'manufacturer' &&
            (e.manufacturer && Object.values(e.manufacturer).some(Boolean) ? (
              <ManufacturerRows info={e.manufacturer} />
            ) : (
              <Blank>Fill in a field and the block appears here.</Blank>
            ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Rendered with the storefront&rsquo;s own components, in the column they ship in beside
          the buy button.
        </p>
      </aside>
    </div>
  )
}

/* ── editors ───────────────────────────────────────────────────────────── */

function PairEditor({ rows, attributes, allAttributes, onChange, warnAfter }) {
  const patch = (i, key, value) => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)))
  const suggestions = attributes.length ? attributes : allAttributes

  return (
    <div className="space-y-3">
      <datalist id="attr-keys">
        {allAttributes.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </datalist>

      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2">
          <div className="min-w-[9rem] flex-1">
            <input
              list="attr-keys"
              className="field h-9 text-[13px]"
              placeholder="Key, e.g. fabric"
              value={row.key || ''}
              onChange={(ev) => patch(i, 'key', ev.target.value)}
            />
            {attributeByKey[row.key] && (
              <p className="mt-1 text-[11px] text-faint">
                Shows as &ldquo;{attributeByKey[row.key].label}&rdquo;
              </p>
            )}
          </div>
          <div className="min-w-[9rem] flex-1">
            <input
              list={`vals-${row.key}`}
              className="field h-9 text-[13px]"
              placeholder="Value"
              value={row.value || ''}
              onChange={(ev) => patch(i, 'value', ev.target.value)}
            />
            {attributeByKey[row.key]?.values && (
              <datalist id={`vals-${row.key}`}>
                {attributeByKey[row.key].values.map((v) => <option key={v} value={v} />)}
              </datalist>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
            aria-label="Remove"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...rows, { key: '', value: '' }])}>
          Add pair
        </Button>
        {warnAfter && rows.length > warnAfter && (
          <span className="text-[12px] text-sale">
            {rows.length} pairs — only the first {warnAfter} are shown above the fold.
          </span>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-[12px] text-faint">Common for apparel</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {suggestions
              .filter((a) => !rows.some((r) => r.key === a.key))
              .slice(0, 10)
              .map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => onChange([...rows, { key: a.key, value: '' }])}
                    className="rounded-xs border border-line px-2 py-1 text-[11px] text-faint transition-colors hover:border-ink hover:text-ink"
                  >
                    + {a.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function FeatureEditor({ items, icons, onChange }) {
  const patch = (i, key, value) => onChange(items.map((f, k) => (k === i ? { ...f, [key]: value } : f)))

  return (
    <div className="space-y-4">
      {items.map((f, i) => (
        <div key={i} className="rounded-xs border border-line p-4">
          <div className="flex items-start gap-4">
            <div className="w-28 shrink-0">
              <label className="mb-1.5 block text-[12px] font-medium">Icon</label>
              <select
                className="field h-9 py-0 text-[12px]"
                value={icons.includes(f.icon) ? f.icon : 'custom'}
                onChange={(ev) => patch(i, 'icon', ev.target.value === 'custom' ? '' : ev.target.value)}
              >
                {icons.map((name) => <option key={name} value={name}>{name}</option>)}
                <option value="custom">Image URL…</option>
              </select>
              <span className="mt-2 grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon name={icons.includes(f.icon) ? f.icon : 'sparkle'} size={20} />
              </span>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              {!icons.includes(f.icon) && (
                <Field
                  label="Icon image URL"
                  mono
                  placeholder="https://cdn…/icon.svg"
                  value={f.icon || ''}
                  onChange={(v) => patch(i, 'icon', v)}
                />
              )}
              <Field label="Title" placeholder="Washed twice before it is cut" value={f.title || ''} onChange={(v) => patch(i, 'title', v)} />
              <div>
                <label className="mb-1.5 block text-[13px] font-medium">Body</label>
                <textarea
                  rows={3}
                  className="field"
                  placeholder="One sentence that says something a competitor could not copy-paste."
                  value={f.body || ''}
                  onChange={(ev) => patch(i, 'body', ev.target.value)}
                />
                <p className={`mt-1 text-[11px] ${(f.body || '').length > 180 ? 'text-sale' : 'text-faint'}`}>
                  {(f.body || '').length} characters — the card truncates past about 180.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onChange(items.filter((_, k) => k !== i))}
              aria-label="Remove feature"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...items, { icon: 'sparkle', title: '', body: '' }])}>
          Add feature
        </Button>
        {items.length > 6 && (
          <span className="text-[12px] text-sale">{items.length} cards is a lot to read. Three is usually the right number.</span>
        )}
      </div>
    </div>
  )
}

/**
 * The services rows.
 *
 * Templates first, free text after. Almost every store wants some version of
 * the same four promises, and typing a returns policy from memory on the
 * fortieth product is how a catalogue ends up offering three different windows.
 */
function AssuranceEditor({ rows, icons, templates, onChange }) {
  const patch = (i, key, value) => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)))

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-xs border border-line p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="w-32 shrink-0">
              <label className="mb-1.5 block text-[12px] font-medium">Icon</label>
              <select
                className="field h-9 py-0 text-[12px]"
                value={icons.includes(row.icon) ? row.icon : 'check'}
                onChange={(ev) => patch(i, 'icon', ev.target.value)}
              >
                {icons.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div className="min-w-[12rem] flex-1">
              <Field
                label="Label"
                placeholder="30-day returns, no reason needed"
                value={row.label || ''}
                onChange={(v) => patch(i, 'label', v)}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, k) => k !== i))}
              aria-label="Remove row"
              className="mt-6 grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
          <div className="mt-3">
            <label className="mb-1.5 block text-[13px] font-medium">
              Note <span className="font-normal text-faint">— behind the (i), optional</span>
            </label>
            <textarea
              rows={2}
              className="field"
              placeholder="Unworn, tags attached. A prepaid label is in every parcel."
              value={row.note || ''}
              onChange={(ev) => patch(i, 'note', ev.target.value)}
            />
          </div>
        </div>
      ))}

      <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...rows, { icon: 'check', label: '', note: '' }])}>
        Add row
      </Button>

      {templates.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-[12px] text-faint">Common for apparel</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {templates
              .filter((t) => !rows.some((r) => r.label === t.label))
              .map((t) => (
                <li key={t.label}>
                  <button
                    type="button"
                    onClick={() => onChange([...rows, { ...t }])}
                    className="inline-flex items-center gap-1.5 rounded-xs border border-line px-2 py-1 text-[11px] text-faint transition-colors hover:border-ink hover:text-ink"
                  >
                    <Icon name={t.icon} size={12} /> {t.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function SpecEditor({ rows, attributes, onChange }) {
  const patch = (i, idx, value) => onChange(rows.map((r, k) => (k === i ? (idx === 0 ? [value, r[1]] : [r[0], value]) : r)))

  return (
    <div className="space-y-3">
      <datalist id="spec-keys">
        {attributes.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </datalist>

      {rows.map(([key, value], i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <div className="min-w-[9rem] flex-1">
            <input
              list="spec-keys"
              className="field h-9 text-[13px]"
              placeholder="Key"
              value={key}
              onChange={(ev) => patch(i, 0, ev.target.value)}
            />
          </div>
          <input
            className="field h-9 min-w-[9rem] flex-1 text-[13px]"
            placeholder="Value"
            value={value}
            onChange={(ev) => patch(i, 1, ev.target.value)}
          />
          <span className="w-28 shrink-0 text-[11px] text-faint">
            {attributeGroups.find((g) => g.id === (attributeByKey[key]?.group || 'general'))?.label}
          </span>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
            aria-label="Remove"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}

      <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...rows, ['', '']])}>
        Add specification
      </Button>
      <p className="text-[12px] text-faint">
        Rows are grouped by their attribute, so the order you enter them in does not matter.
      </p>
    </div>
  )
}

/* ── bits ──────────────────────────────────────────────────────────────── */

function Panel({ title, note, children }) {
  return (
    <section className="rounded-xs border border-line bg-surface p-5">
      <h2 className="text-[14px] font-medium">{title}</h2>
      {note && <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ label, mono, onChange, ...rest }) {
  const id = `en-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input id={id} className={`field h-9 text-[13px] ${mono ? 'font-mono' : ''}`} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  )
}

function Blank({ children }) {
  return <p className="rounded-xs border border-dashed border-line p-6 text-center text-[13px] text-faint">{children}</p>
}
