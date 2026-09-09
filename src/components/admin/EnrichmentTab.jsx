import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon } from '../ui/index.jsx'
import {
  ProductHighlights,
  ProductAssurances,
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
export default function EnrichmentTab({
  draft,
  set,
  attributes = [],
  icons = [],
  assuranceTemplates = [],
  featurePresets = [],
  onSaveToLibrary,
}) {
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
            <FeatureEditor
              items={e.features || []}
              icons={icons}
              presets={featurePresets}
              onChange={(items) => setE('features', items)}
              onSave={onSaveToLibrary && ((item) => onSaveToLibrary('features', item))}
            />
          </Panel>
        )}

        {section === 'comes-with' && (
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
        )}

        {section === 'specs' && (
          <Panel
            title="Specifications"
            note="The full table, below the fold, grouped automatically by attribute. Nobody reads it end to end; everybody uses it to check one thing."
          >
            <SpecEditor specs={e.specs} attributes={attributes} onChange={(next) => setE('specs', next)} />
          </Panel>
        )}

        {section === 'manufacturer' && (
          <Panel
            title="Manufacturer info"
            note="Legally required on a listing in several markets — India's Legal Metrology rules mandate the manufacturer and packer address, the country of origin and the net quantity. Treat it as compliance, not marketing."
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Woven by"
                  placeholder="Veshti Mills"
                  value={e.maker?.name || ''}
                  onChange={(v) => setMaker('name', v)}
                />
                <Field
                  label="Mill location"
                  placeholder="Erode, Tamil Nadu"
                  value={e.maker?.location || ''}
                  onChange={(v) => setMaker('location', v)}
                />
              </div>
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
            (e.assurances?.length ? (
              <ProductAssurances product={preview} />
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
            (e.maker?.name || Object.values(e.manufacturer || {}).some(Boolean) ? (
              <ManufacturerRows info={e.manufacturer} maker={e.maker} />
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
  const used = new Set(rows.map((r) => r.key))

  // The starred ones first: they are the handful worth putting above the fold,
  // and a merchant filling in highlights wants those before the long tail.
  const suggestions = [
    ...attributes.filter((a) => !used.has(a.key)),
    ...allAttributes.filter((a) => !used.has(a.key) && !attributes.some((x) => x.key === a.key)),
  ]

  return (
    <div className="space-y-3">
      <ChipPicker
        label="Common for apparel"
        items={suggestions}
        onPick={(key) => onChange([...rows, { key, value: '' }])}
      />

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
    </div>
  )
}

/**
 * Pick an icon by looking at it.
 *
 * Both editors used a `<select>` of names — `sparkle`, `ruler`, `thermometer`
 * — which asks a merchant to translate a word into a picture in their head and
 * be right. Nobody browses a dropdown of twenty nouns; they take whichever one
 * they recognise first, and the same three icons end up on everything.
 *
 * A grid of the actual glyphs is the whole fix. The custom slot stays, because
 * a brand with its own iconography should not be limited to ours.
 */
function IconPicker({ value, icons, onChange, allowCustom = true }) {
  const custom = Boolean(value) && !icons.includes(value)

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[12px] font-medium">Icon</p>
      <ul className="flex flex-wrap gap-1.5">
        {icons.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => onChange(name)}
              aria-pressed={value === name}
              aria-label={name}
              title={name}
              className={`grid h-9 w-9 place-items-center rounded-xs border transition-colors ${
                value === name
                  ? 'border-ink bg-ink text-page'
                  : 'border-line text-muted hover:border-ink hover:text-ink'
              }`}
            >
              <Icon name={name} size={17} />
            </button>
          </li>
        ))}
        {allowCustom && (
          <li>
            <button
              type="button"
              onClick={() => onChange(custom ? 'sparkle' : 'https://')}
              aria-pressed={custom}
              title="Use your own image"
              className={`grid h-9 place-items-center rounded-xs border px-2.5 text-[11px] transition-colors ${
                custom ? 'border-ink bg-ink text-page' : 'border-line text-muted hover:border-ink hover:text-ink'
              }`}
            >
              Image URL
            </button>
          </li>
        )}
      </ul>

      {allowCustom && custom && (
        <input
          className="field mt-2 h-9 font-mono text-[12px]"
          placeholder="https://cdn…/icon.svg"
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
        />
      )}
    </div>
  )
}


function FeatureEditor({ items, icons, presets = [], onChange, onSave }) {
  const patch = (i, key, value) => onChange(items.map((f, k) => (k === i ? { ...f, [key]: value } : f)))
  const unused = presets.filter((p) => !items.some((f) => f.title === p.title))

  return (
    <div className="space-y-4">
      {/* Cards this store has written before. A studio putting the same
          "Repairable for life" card on forty products should paste it, not
          retype it and end up with forty slightly different versions. */}
      <ChipPicker
        label="Saved on other products"
        items={unused.map((p) => ({ key: p.id, label: p.title, icon: p.icon }))}
        onPick={(id) => {
          const preset = presets.find((p) => p.id === id)
          onChange([...items, { icon: preset.icon, title: preset.title, body: preset.body }])
        }}
        limit={6}
      />

      {items.map((f, i) => (
        <div key={i} className="rounded-xs border border-line p-4">
          <div className="flex items-start justify-between gap-3">
            <IconPicker value={f.icon} icons={icons} onChange={(v) => patch(i, 'icon', v)} />
            <div className="flex shrink-0 items-center gap-1">
              {onSave && f.title && (
                <button
                  type="button"
                  onClick={() => onSave({ icon: f.icon, title: f.title, body: f.body })}
                  className="rounded-xs border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  Save for reuse
                </button>
              )}
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

          <div className="mt-3 space-y-3">
            <Field
              label="Title"
              placeholder="Washed twice before it is cut"
              value={f.title || ''}
              onChange={(v) => patch(i, 'title', v)}
            />
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
                {(f.body || '').length} characters — the card clamps to three lines past about 105.
              </p>
            </div>
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
function AssuranceEditor({ rows, icons, templates, onChange, onSave }) {
  const patch = (i, key, value) => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: value } : r)))
  const unused = templates.filter((t) => !rows.some((r) => r.label === t.label))

  return (
    <div className="space-y-3">
      {/* Templates above the rows, for the same reason the attribute chips are:
          a list found only after you have given up and typed something is a
          list for the merchant who least needed it. */}
      <ChipPicker
        label="Common for apparel"
        items={unused.map((t) => ({ key: t.label, label: t.label, icon: t.icon }))}
        onPick={(label) => onChange([...rows, { ...templates.find((t) => t.label === label) }])}
        limit={6}
      />

      {rows.map((row, i) => (
        <div key={i} className="rounded-xs border border-line p-4">
          <div className="flex items-start justify-between gap-3">
            <IconPicker value={row.icon} icons={icons} onChange={(v) => patch(i, 'icon', v)} allowCustom={false} />
            <div className="flex shrink-0 items-center gap-1">
              {onSave && row.label && !templates.some((t) => t.label === row.label) && (
                <button
                  type="button"
                  onClick={() => onSave({ icon: row.icon, label: row.label, note: row.note })}
                  className="rounded-xs border border-line px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  Save for reuse
                </button>
              )}
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, k) => k !== i))}
              aria-label="Remove row"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
            >
              <Icon name="trash" size={14} />
            </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <Field
              label="Label"
              placeholder="30-day returns, no reason needed"
              value={row.label || ''}
              onChange={(v) => patch(i, 'label', v)}
            />
            <div>
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
        </div>
      ))}

      <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...rows, { icon: 'check', label: '', note: '' }])}>
        Add row
      </Button>
    </div>
  )
}

/**
 * Specifications, as an editable list over a map.
 *
 * The bug this fixes was a round trip that ate its own input. Rows were derived
 * straight from `enrichment.specs` and written back as
 * `Object.fromEntries(rows.filter(([k]) => k))` — so "Add specification"
 * appended `['', '']`, the filter dropped it for having no key, the object came
 * back unchanged, and the row vanished on the same tick. The button worked
 * perfectly and did nothing, every time.
 *
 * A map cannot hold a half-typed row, and a half-typed row is most of what an
 * editor is for. So the rows live here while they are being edited and the map
 * is written on every keystroke with the incomplete ones left out. The stored
 * shape is unchanged — `specs` is still a flat map, still grouped on read.
 *
 * The signature guard is what stops the two representations fighting: an
 * outside change (switching product, loading a draft) is adopted, our own write
 * coming back is not.
 */
function SpecEditor({ specs, attributes, onChange }) {
  const committed = useMemo(() => Object.entries(specs || {}), [specs])
  const [rows, setRows] = useState(committed)
  const mine = useRef(JSON.stringify(committed))

  useEffect(() => {
    const signature = JSON.stringify(committed)
    if (signature === mine.current) return
    mine.current = signature
    setRows(committed)
  }, [committed])

  const push = (next) => {
    setRows(next)
    const map = {}
    for (const [k, v] of next) if (k.trim()) map[k.trim()] = v
    mine.current = JSON.stringify(Object.entries(map))
    onChange(map)
  }

  const patch = (i, idx, value) =>
    push(rows.map((r, k) => (k === i ? (idx === 0 ? [value, r[1]] : [r[0], value]) : r)))

  const used = new Set(rows.map(([k]) => k))
  const suggestions = attributes.filter((a) => !used.has(a.key))
  const duplicate = (key, i) => key && rows.findIndex(([k]) => k === key) !== i

  return (
    <div className="space-y-3">
      {/* Suggestions first. A merchant looking for "sleeve" should not have to
          add a blank row, guess that the field is a combobox, and then discover
          the list — the list is the fastest path and belongs above the work. */}
      {suggestions.length > 0 && (
        <ChipPicker
          label="Add a common attribute"
          items={suggestions.map((a) => ({ key: a.key, label: a.label, group: a.group }))}
          onPick={(key) => push([...rows, [key, '']])}
        />
      )}

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
            {duplicate(key, i) && (
              <p className="mt-1 text-[11px] text-sale">
                Already used above — the later row wins.
              </p>
            )}
          </div>
          <input
            list={`spec-vals-${key}`}
            className="field h-9 min-w-[9rem] flex-1 text-[13px]"
            placeholder="Value"
            value={value}
            onChange={(ev) => patch(i, 1, ev.target.value)}
          />
          {attributeByKey[key]?.values && (
            <datalist id={`spec-vals-${key}`}>
              {attributeByKey[key].values.map((v) => <option key={v} value={v} />)}
            </datalist>
          )}
          <span className="w-28 shrink-0 text-[11px] text-faint">
            {attributeGroups.find((g) => g.id === (attributeByKey[key]?.group || 'general'))?.label}
          </span>
          <button
            type="button"
            onClick={() => push(rows.filter((_, k) => k !== i))}
            aria-label="Remove"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}

      <Button size="sm" variant="quiet" icon="plus" onClick={() => push([...rows, ['', '']])}>
        Add specification
      </Button>
      <p className="text-[12px] text-faint">
        Rows are grouped by their attribute, so the order you enter them in does not matter. A row
        with no key is ignored until you name it.
      </p>
    </div>
  )
}

/**
 * The suggestion list, as chips, above the rows it fills in.
 *
 * It used to sit under the editor as a flat run of ten. Two things were wrong
 * with that. Underneath, it is found only by someone who has already given up
 * and typed something — which is precisely the merchant who most needed it. And
 * flat, it hides the shape of the vocabulary: "Fabric care" and "Country of
 * origin" are not the same kind of thing and a single row of chips says they
 * are.
 *
 * Grouped and on top, it reads as a menu of what this store knows how to
 * describe, which is what it actually is. Long groups collapse rather than
 * truncate, because a hard cut at ten is how an attribute nobody can find gets
 * retyped as a near-duplicate.
 */
function ChipPicker({ label, items, onPick, groups = attributeGroups, limit = 8 }) {
  const [expanded, setExpanded] = useState(false)
  if (!items.length) return null

  const grouped = items.some((i) => i.group)
  const buckets = grouped
    ? groups
        .map((g) => ({ id: g.id, label: g.label, items: items.filter((i) => (i.group || 'general') === g.id) }))
        .filter((b) => b.items.length)
    : [{ id: 'all', label: null, items }]

  const total = items.length
  const overflowing = !expanded && total > limit
  let budget = expanded ? Infinity : limit

  return (
    <div className="rounded-xs border border-line bg-page p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-medium">{label}</p>
        {total > limit && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="link-underline text-[12px] text-accent"
          >
            {expanded ? 'Show fewer' : `Show all ${total}`}
          </button>
        )}
      </div>

      <div className="mt-2.5 space-y-2.5">
        {buckets.map((bucket) => {
          const shown = bucket.items.slice(0, budget)
          budget -= shown.length
          if (!shown.length) return null
          return (
            <div key={bucket.id}>
              {bucket.label && (
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                  {bucket.label}
                </p>
              )}
              <ul className="flex flex-wrap gap-1.5">
                {shown.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onPick(item.key, item)}
                      className="inline-flex items-center gap-1.5 rounded-xs border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-ink hover:text-ink"
                    >
                      {item.icon && <Icon name={item.icon} size={12} />}
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {overflowing && (
        <p className="mt-2 text-[11px] text-faint">
          {total - limit} more — nothing here is required, and anything you type is accepted.
        </p>
      )}
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
