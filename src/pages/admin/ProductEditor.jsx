import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Icon, Skeleton } from '../../components/ui/index.jsx'
import { Hint } from '../../components/admin/Tour.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney, toMinor, toMajor } from '../../lib/money.js'

/**
 * The whole product record.
 *
 * Everything visible on a product page is editable here, and the tabs follow
 * the order a merchandiser fills them in rather than the order the JSON happens
 * to be written: what it is, what it looks like, what you can buy, how it fits,
 * where it sits.
 *
 * Two things this deliberately does not do:
 *
 *  - It does not save on every keystroke. A product is a document, and a
 *    half-typed slug written to the catalogue is a broken URL on the live shop.
 *    Changes are held in a draft and committed on Save.
 *  - It does not let you delete an option value that variants still reference
 *    without saying what will happen. Silent variant destruction is how a
 *    catalogue loses stock nobody notices for a week.
 */

const BLANK = () => ({
  slug: '',
  title: '',
  subtitle: '',
  description: '',
  details: [],
  care: [],
  tags: [],
  badges: [],
  price: { amount: 0, currency: 'USD' },
  compareAtPrice: null,
  images: [],
  options: [
    { name: 'Color', values: [] },
    { name: 'Size', values: [] },
  ],
  swatches: {},
  variants: [],
  categories: [],
  rating: { average: 0, count: 0 },
  fit: null,
  fabric: null,
  sizeChartId: null,
  social: null,
  published: false,
  createdAt: new Date().toISOString(),
})

const TABS = [
  ['details', 'Details'],
  ['media', 'Media'],
  ['variants', 'Variants'],
  ['fit', 'Fit & fabric'],
  ['organise', 'Organise'],
]

export default function ProductEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { push } = useToast()

  const loaded = useAsync(() => api.adminGetProduct(id), [id], { skip: isNew })
  const charts = useAsync(() => api.listSizeCharts(), [])
  const cats = useAsync(() => api.listCategories(), [])

  const [draft, setDraft] = useState(isNew ? BLANK() : null)
  const [tab, setTab] = useState('details')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (loaded.data && !draft) setDraft(structuredClone(loaded.data))
  }, [loaded.data, draft])

  const set = useCallback((path, value) => {
    setDirty(true)
    setDraft((d) => {
      const next = structuredClone(d)
      const keys = path.split('.')
      let node = next
      keys.slice(0, -1).forEach((k) => {
        node[k] = node[k] ?? {}
        node = node[k]
      })
      node[keys.at(-1)] = value
      return next
    })
  }, [])

  // Leaving with unsaved work should cost a keystroke, not a product.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = async () => {
    if (!draft.slug || !draft.title) {
      push('A title and a slug are required.', { tone: 'error' })
      setTab('details')
      return
    }
    setBusy(true)
    try {
      await api.adminSaveProduct(draft)
      setDirty(false)
      push(isNew ? 'Product created' : 'Saved')
      navigate('/admin/products')
    } catch (err) {
      push(err.message, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.adminDeleteProduct(draft.id || draft.slug)
      push('Product deleted')
      navigate('/admin/products')
    } catch (err) {
      push(err.message, { tone: 'error' })
      setBusy(false)
    }
  }

  if (loaded.loading || !draft) return <Skeleton className="h-96 w-full" />

  const props = { draft, set, charts: charts.data?.items || [], cats: cats.data?.items || [] }

  return (
    <div className="pb-24">
      <button
        type="button"
        onClick={() => navigate('/admin/products')}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted link-underline"
      >
        <Icon name="chevron-left" size={14} /> All products
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display-md">{isNew ? 'New product' : draft.title || 'Untitled'}</h1>
          <p className="mt-1.5 font-mono text-[12px] text-faint">{draft.slug || 'no-slug-yet'}</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="rounded-xs bg-accent-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              Unsaved
            </span>
          )}
          {!isNew && draft.slug && (
            <a
              href={`/product/${draft.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
            >
              View on store <Icon name="arrow-right" size={14} />
            </a>
          )}
        </div>
      </div>

      <div className="mt-7 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[13px] transition-colors ${
              tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8 max-w-3xl">
        {tab === 'details' && <DetailsTab {...props} isNew={isNew} />}
        {tab === 'media' && <MediaTab {...props} />}
        {tab === 'variants' && <VariantsTab {...props} />}
        {tab === 'fit' && <FitTab {...props} />}
        {tab === 'organise' && <OrganiseTab {...props} />}
      </div>

      {/* A save bar that is always reachable. On a five-tab form, a button at
          the bottom of tab three is a button nobody finds. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-page/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-5 py-3">
          <p className="hidden text-[12px] text-faint sm:block">
            {dirty ? 'Unsaved changes' : 'Everything saved'}
          </p>
          <div className="ml-auto flex gap-3">
            {!isNew && (
              <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-sale">
                Delete
              </Button>
            )}
            <Button variant="quiet" size="sm" onClick={() => navigate('/admin/products')} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── details ───────────────────────────────────────────────────────────── */

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function DetailsTab({ draft, set, isNew }) {
  const currency = draft.price?.currency || 'USD'
  return (
    <div className="space-y-8">
      <Panel title="Basics">
        <Text
          label="Title"
          value={draft.title}
          onChange={(v) => {
            set('title', v)
            // Only auto-slug a new product. Changing the slug of a live one
            // breaks every link and every ad pointing at it.
            if (isNew) set('slug', slugify(v))
          }}
        />
        <Text
          label="Slug"
          mono
          value={draft.slug}
          onChange={(v) => set('slug', slugify(v))}
          hint="The web address: /product/your-slug. Changing it on a live product breaks existing links and ads."
        />
        <Text label="Subtitle" value={draft.subtitle} onChange={(v) => set('subtitle', v)}
          hint="One line under the title. The fabric or the cut, not a sales line." />
        <Area label="Description" rows={5} value={draft.description} onChange={(v) => set('description', v)} />
      </Panel>

      <Panel title="Price">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text
            label="Price"
            type="number"
            step="0.01"
            value={toMajor(draft.price)}
            onChange={(v) => set('price', { amount: toMinor(Number(v) || 0), currency })}
            hint="Typed the way you say it. Stored as an integer number of cents so a total can never drift."
          />
          <Text
            label="Compare at"
            type="number"
            step="0.01"
            value={draft.compareAtPrice ? toMajor(draft.compareAtPrice) : ''}
            onChange={(v) =>
              set('compareAtPrice', v ? { amount: toMinor(Number(v)), currency } : null)
            }
            hint="Shows a strikethrough and a discount badge. Leave empty for no sale."
          />
        </div>
        <p className="text-[12px] text-faint">
          Sells at {formatMoney(draft.price)}
          {draft.compareAtPrice ? ` — was ${formatMoney(draft.compareAtPrice)}` : ''}
        </p>
      </Panel>

      <Panel title="Specification" note="Rendered as the Details and Care tabs on the product page. One line each.">
        <ListEditor label="Details" items={draft.details} onChange={(v) => set('details', v)}
          placeholder="140gsm long-staple cotton oxford" />
        <ListEditor label="Care" items={draft.care} onChange={(v) => set('care', v)}
          placeholder="Machine wash cold, gentle" />
      </Panel>

      <Panel
        title="Visibility"
        note="A draft is invisible to shoppers and returns 404 on its own URL, so a season can be staged before it opens."
      >
        <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
          <input
            type="checkbox"
            checked={draft.published !== false}
            onChange={(e) => set('published', e.target.checked)}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
          Published — visible on the storefront
        </label>
      </Panel>

      <Panel title="Badges" note="Sale, sold-out and low-stock are derived from price and stock on save. These two are yours.">
        <div className="flex flex-wrap gap-2">
          {['new', 'bestseller', 'low-stock'].map((b) => {
            const on = draft.badges?.includes(b)
            return (
              <button
                key={b}
                type="button"
                onClick={() =>
                  set('badges', on ? draft.badges.filter((x) => x !== b) : [...(draft.badges || []), b])
                }
                className={`rounded-xs border px-3 py-1.5 text-[12px] capitalize transition-colors ${
                  on ? 'border-ink bg-ink text-page' : 'border-line text-muted hover:border-ink'
                }`}
              >
                {b}
              </button>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}

/* ── media ─────────────────────────────────────────────────────────────── */

function MediaTab({ draft, set }) {
  const colors = draft.options?.find((o) => o.name === 'Color')?.values || []

  const add = () =>
    set('images', [
      ...(draft.images || []),
      { id: `img_${Math.random().toString(36).slice(2, 8)}`, url: '', alt: '', width: 900, height: 1125 },
    ])

  const patch = (i, key, value) =>
    set('images', draft.images.map((img, k) => (k === i ? { ...img, [key]: value } : img)))

  const move = (i, dir) => {
    const next = draft.images.slice()
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set('images', next)
  }

  return (
    <div className="space-y-8">
      <Panel
        title="Images"
        note="Shot 4:5 (900 × 1125). The first is the card image; the second is what the grid swaps to on hover, so give it something different — a fabric detail works well."
      >
        {(draft.images || []).length === 0 && (
          <p className="rounded-xs border border-dashed border-line p-6 text-center text-[13px] text-faint">
            No images yet. A product with no image will render an empty well.
          </p>
        )}

        <ul className="space-y-4">
          {(draft.images || []).map((img, i) => (
            <li key={img.id || i} className="flex gap-4 rounded-xs border border-line p-4">
              <div className="w-24 shrink-0">
                <div className="shot rounded-xs">
                  {img.url ? <img src={img.url} alt="" loading="lazy" /> : null}
                </div>
                <p className="mt-1.5 text-center font-mono text-[10px] text-faint">
                  {i === 0 ? 'primary' : i === 1 ? 'hover' : `#${i + 1}`}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <Text label="URL" mono value={img.url} onChange={(v) => patch(i, 'url', v)}
                  placeholder="/images/products/slug-1.jpg or https://cdn…" />
                <div className="grid grid-cols-2 gap-3">
                  <Text label="Width" type="number" value={img.width ?? ''} onChange={(v) => patch(i, 'width', Number(v) || null)}
                    hint="Sent to the browser so the grid does not reflow while the image decodes." />
                  <Text label="Height" type="number" value={img.height ?? ''} onChange={(v) => patch(i, 'height', Number(v) || null)} />
                </div>
                <Text
                  label="Alt text"
                  value={img.alt}
                  onChange={(v) => patch(i, 'alt', v)}
                  hint="Required. Describe the garment, not the photo — this is what a screen reader and an image search both read."
                />
                {colors.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium">Shows for colour</label>
                    <select
                      className="field"
                      value={img.color || ''}
                      onChange={(e) => patch(i, 'color', e.target.value || undefined)}
                    >
                      <option value="">All colours</option>
                      {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <p className="mt-1.5 text-[12px] text-faint">
                      Assign a colour and the gallery jumps here when a shopper picks it. Rebuild the
                      variant matrix afterwards so the variants point at it too.
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <IconBtn label="Move up" icon="chevron-left" rotate onClick={() => move(i, -1)} />
                  <IconBtn label="Move down" icon="chevron-right" rotate onClick={() => move(i, 1)} />
                  <IconBtn label="Remove" icon="trash" tone="sale"
                    onClick={() => set('images', draft.images.filter((_, k) => k !== i))} />
                </div>
              </div>
            </li>
          ))}
        </ul>

        <Button size="sm" variant="quiet" icon="plus" onClick={add}>Add image</Button>

        <p className="text-[12px] leading-relaxed text-faint">
          Images are referenced by URL rather than uploaded — the storefront is a static site with no
          file server. Point these at your CDN, or drop files into <code className="font-mono">public/images/products/</code>
          and use a root-relative path.
        </p>
      </Panel>
    </div>
  )
}

/* ── variants ──────────────────────────────────────────────────────────── */

function VariantsTab({ draft, set }) {
  const colorOpt = draft.options?.find((o) => o.name === 'Color') || { name: 'Color', values: [] }
  const sizeOpt = draft.options?.find((o) => o.name === 'Size') || { name: 'Size', values: [] }

  const setOption = (name, values) =>
    set('options', [
      { name: 'Color', values: name === 'Color' ? values : colorOpt.values },
      { name: 'Size', values: name === 'Size' ? values : sizeOpt.values },
    ])

  /**
   * Regenerate the matrix, preserving anything already entered.
   *
   * Rebuilding from scratch would wipe stock counts and SKUs every time someone
   * adds a colour, which is the kind of data loss you only notice at stocktake.
   */
  const rebuild = () => {
    const existing = new Map((draft.variants || []).map((v) => [`${v.options.Color}|${v.options.Size}`, v]))
    const next = []
    for (const c of colorOpt.values) {
      for (const s of sizeOpt.values) {
        const key = `${c}|${s}`
        const prev = existing.get(key)
        next.push(
          prev || {
            id: `var_${draft.slug || 'new'}_${c}_${s}`.toLowerCase().replace(/[^a-z0-9_]+/g, '-'),
            sku: `${(draft.slug || 'SKU').slice(0, 6).toUpperCase()}-${c.slice(0, 3).toUpperCase()}-${s}`,
            options: { Color: c, Size: s },
            price: draft.price,
            compareAtPrice: draft.compareAtPrice,
            inventory: 0,
            available: false,
            // Prefer a shot tagged with this colour, so a store with per-colour
            // photography wires itself up without anyone picking image ids.
            imageId:
              draft.images?.find((img) => img.color === c)?.id || draft.images?.[0]?.id || null,
          },
        )
      }
    }
    set('variants', next)
  }

  const expected = colorOpt.values.length * sizeOpt.values.length
  const stale = expected !== (draft.variants?.length || 0)

  const patchVariant = (id, key, value) =>
    set(
      'variants',
      draft.variants.map((v) =>
        v.id === id
          ? { ...v, [key]: value, ...(key === 'inventory' ? { available: Number(value) > 0 } : {}) }
          : v,
      ),
    )

  return (
    <div className="space-y-8">
      <Panel title="Colours" note="The swatch colour is what the picker shows. Pick something close to the real cloth.">
        <SwatchEditor
          values={colorOpt.values}
          swatches={draft.swatches || {}}
          onChange={(values, swatches) => {
            setOption('Color', values)
            set('swatches', swatches)
          }}
        />
      </Panel>

      <Panel title="Sizes">
        <TokenEditor
          values={sizeOpt.values}
          onChange={(v) => setOption('Size', v)}
          suggestions={['XS', 'S', 'M', 'L', 'XL', 'One Size']}
        />
      </Panel>

      <Panel
        title="Variants"
        note="One row per colour and size. Stock lives here, not on the product — which is what lets the size picker grey out only the sizes that are gone in the colour a shopper has chosen."
      >
        {stale && (
          <div className="flex flex-wrap items-center gap-3 rounded-xs border border-accent/30 bg-accent-soft/50 p-3.5">
            <p className="text-[13px] text-accent">
              {expected} combinations, {draft.variants?.length || 0} rows. Rebuild to match.
            </p>
            <Button size="sm" variant="quiet" onClick={rebuild} className="ml-auto">
              Rebuild matrix
            </Button>
          </div>
        )}

        {(draft.variants || []).length === 0 ? (
          <p className="rounded-xs border border-dashed border-line p-6 text-center text-[13px] text-faint">
            Add colours and sizes above, then rebuild the matrix.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xs border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line bg-sunken/40 text-left">
                  <th className="p-2.5 font-medium">Variant</th>
                  <th className="p-2.5 font-medium">SKU</th>
                  <th className="p-2.5 font-medium">Stock</th>
                  <th className="p-2.5 font-medium">Price override</th>
                </tr>
              </thead>
              <tbody>
                {draft.variants.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-0">
                    <td className="p-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full ring-1 ring-inset ring-ink/15"
                          style={{ background: draft.swatches?.[v.options.Color] || '#ddd' }}
                        />
                        {v.options.Color} · {v.options.Size}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <input className="field h-8 font-mono text-[12px]" value={v.sku}
                        onChange={(e) => patchVariant(v.id, 'sku', e.target.value)} />
                    </td>
                    <td className="p-2.5">
                      <input type="number" min="0" className="field h-8 w-20 tabular-nums" value={v.inventory}
                        onChange={(e) => patchVariant(v.id, 'inventory', Math.max(0, Number(e.target.value)))} />
                    </td>
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={String(toMajor(draft.price))}
                        className="field h-8 w-28 tabular-nums"
                        value={v.price?.amount !== draft.price?.amount ? toMajor(v.price) : ''}
                        onChange={(e) =>
                          patchVariant(
                            v.id,
                            'price',
                            e.target.value
                              ? { amount: toMinor(Number(e.target.value)), currency: draft.price.currency }
                              : draft.price,
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ── fit and fabric ────────────────────────────────────────────────────── */

function FitTab({ draft, set, charts }) {
  const fit = draft.fit || {}
  const fabric = draft.fabric || {}
  const fb = fit.feedback || { small: 0, true: 100, large: 0 }

  return (
    <div className="space-y-8">
      <Panel
        title="Fit"
        note="Size and fit cause roughly two thirds of fashion returns. This block is the cheapest thing on the page that reduces them."
      >
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">Verdict</label>
          <select className="field" value={fit.verdict || ''} onChange={(e) => set('fit.verdict', e.target.value || null)}>
            <option value="">Not stated</option>
            <option value="true-to-size">True to size</option>
            <option value="runs-small">Runs small</option>
            <option value="runs-large">Runs large</option>
          </select>
        </div>

        <Area label="Fit note" rows={2} value={fit.note || ''} onChange={(v) => set('fit.note', v)}
          placeholder="Cut a half-size roomier through the chest than a dress shirt." />

        <div>
          <label className="mb-1.5 block text-[13px] font-medium">
            Purchaser feedback
            <Hint>
              Percentages from post-purchase surveys, not from your own view of the cut. If you have
              no data, leave the total at zero and the bar is hidden — an invented distribution
              produces exactly the returns it was meant to prevent.
            </Hint>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {['small', 'true', 'large'].map((k) => (
              <div key={k}>
                <input type="number" min="0" max="100" className="field tabular-nums" value={fb[k] ?? 0}
                  onChange={(e) => set(`fit.feedback.${k}`, Number(e.target.value))} />
                <p className="mt-1 text-[11px] capitalize text-faint">
                  {k === 'true' ? 'true to size' : `runs ${k}`}
                </p>
              </div>
            ))}
          </div>
          <p className={`mt-2 text-[12px] ${fb.small + fb.true + fb.large === 100 ? 'text-faint' : 'text-sale'}`}>
            Total {fb.small + fb.true + fb.large}% {fb.small + fb.true + fb.large === 100 ? '' : '— should be 100'}
          </p>
          <Text label="Sample size" type="number" value={fit.sample ?? 0} onChange={(v) => set('fit.sample', Number(v))} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Model height (cm)" type="number" value={fit.model?.height ?? ''} onChange={(v) => set('fit.model.height', Number(v))} />
          <Text label="Shown as" value={fit.model?.label ?? ''} onChange={(v) => set('fit.model.label', v)} placeholder={`5'11"`} />
          <Text label="Size worn" value={fit.model?.size ?? ''} onChange={(v) => set('fit.model.size', v)} />
        </div>
      </Panel>

      <Panel title="Size chart" note="Garment measurements laid flat. A letter size does not transfer between brands; a chest measurement does.">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium">Use chart</label>
          <select className="field" value={draft.sizeChartId || ''} onChange={(e) => set('sizeChartId', e.target.value || null)}>
            <option value="">None</option>
            {charts.map((c) => (
              <option key={c.id} value={c.id}>{c.id} — {c.columns.slice(1).join(', ')}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px] text-faint">
            Shared between products. Edit one under Size charts and every product using it updates.
          </p>
        </div>
      </Panel>

      <Panel title="Fabric" note="Weight decides drape, warmth and whether a thing is see-through. 190gsm linen and 110gsm linen are different products.">
        <CompositionEditor value={fabric.composition || []} onChange={(v) => set('fabric.composition', v)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Weight (gsm)" type="number" value={fabric.weight ?? ''} onChange={(v) => set('fabric.weight', v ? Number(v) : null)} />
          <Text label="Construction" value={fabric.weave || ''} onChange={(v) => set('fabric.weave', v)} placeholder="Oxford" />
          <Text label="Made in" value={fabric.origin || ''} onChange={(v) => set('fabric.origin', v)} placeholder="Guimarães, Portugal" />
        </div>
        <ListEditor
          label="Certifications"
          items={fabric.certifications || []}
          onChange={(v) => set('fabric.certifications', v)}
          placeholder="OEKO-TEX Standard 100"
          hint="Third-party marks only. A self-declared claim reads as greenwashing; an audited one is checkable."
        />
      </Panel>
    </div>
  )
}

/* ── organise ──────────────────────────────────────────────────────────── */

function OrganiseTab({ draft, set, cats }) {
  const toggle = (slug) =>
    set('categories', draft.categories?.includes(slug)
      ? draft.categories.filter((s) => s !== slug)
      : [...(draft.categories || []), slug])

  return (
    <div className="space-y-8">
      <Panel
        title="Categories"
        note="Tick the specific one. Its parents are matched automatically, so a linen shirt filed under Linen also appears under Shirts."
      >
        <ul className="space-y-3">
          {cats.map((root) => (
            <li key={root.slug}>
              <Check label={root.name} sub={root.slug} checked={draft.categories?.includes(root.slug)} onChange={() => toggle(root.slug)} />
              {root.children?.length > 0 && (
                <ul className="mt-2 space-y-2 border-l border-line pl-4">
                  {root.children.map((c) => (
                    <li key={c.slug}>
                      <Check label={c.name} sub={c.slug} checked={draft.categories?.includes(c.slug)} onChange={() => toggle(c.slug)} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Tags" note="Used by filters and by the automatic recommendation strategy. Fabric and use, not adjectives.">
        <TokenEditor values={draft.tags || []} onChange={(v) => set('tags', v)}
          suggestions={['cotton', 'linen', 'merino', 'cashmere', 'wool', 'silk', 'denim', 'leather', 'everyday', 'summer', 'winter', 'organic', 'recycled']} />
      </Panel>

      <Panel
        title="Demand"
        note="Shown under the buy button when it clears the threshold in Storefront settings. Real counts only — a shopper who spots one invented number stops believing the rest of the page."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Bought in 30 days" type="number" value={draft.social?.boughtLast30Days ?? 0}
            onChange={(v) => set('social.boughtLast30Days', Number(v))} />
          <Text label="Times saved" type="number" value={draft.social?.savedCount ?? 0}
            onChange={(v) => set('social.savedCount', Number(v))} />
        </div>
      </Panel>

      <Panel title="Rating" note="Normally written by your review system. Editable here so a migrated catalogue can carry its history.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Average" type="number" step="0.1" min="0" max="5" value={draft.rating?.average ?? 0} onChange={(v) => set('rating.average', Number(v))} />
          <Text label="Review count" type="number" value={draft.rating?.count ?? 0} onChange={(v) => set('rating.count', Number(v))} />
        </div>
        <p className="text-[12px] text-faint">
          A perfect 5.0 converts worse than 4.8 — it reads as filtered.
        </p>
      </Panel>
    </div>
  )
}

/* ── field primitives ──────────────────────────────────────────────────── */

function Panel({ title, note, children }) {
  return (
    <section className="rounded-xs border border-line bg-surface p-5">
      <h2 className="text-[14px] font-medium">{title}</h2>
      {note && <p className="mt-1.5 text-[12px] leading-relaxed text-faint">{note}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Text({ label, hint, mono, onChange, ...rest }) {
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </label>
      <input id={id} className={`field ${mono ? 'font-mono text-[13px]' : ''}`}
        onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  )
}

function Area({ label, onChange, ...rest }) {
  const id = `a-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <textarea id={id} className="field" onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  )
}

function Check({ label, sub, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
      <input type="checkbox" checked={!!checked} onChange={onChange} className="h-4 w-4 accent-[rgb(var(--accent))]" />
      <span>{label}</span>
      <span className="font-mono text-[11px] text-faint">{sub}</span>
    </label>
  )
}

function IconBtn({ label, icon, onClick, tone, rotate }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-xs border border-line transition-colors hover:border-ink ${tone === 'sale' ? 'text-sale hover:border-sale' : 'text-muted'}`}
    >
      <Icon name={icon} size={14} className={rotate ? 'rotate-90' : ''} />
    </button>
  )
}

function ListEditor({ label, items, onChange, placeholder, hint }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </label>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <input className="field" value={item} placeholder={placeholder}
              onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
            <IconBtn label="Remove" icon="trash" tone="sale" onClick={() => onChange(items.filter((_, k) => k !== i))} />
          </li>
        ))}
      </ul>
      <Button size="sm" variant="quiet" icon="plus" className="mt-2.5" onClick={() => onChange([...items, ''])}>
        Add line
      </Button>
    </div>
  )
}

function TokenEditor({ values, onChange, suggestions = [] }) {
  const [input, setInput] = useState('')
  const add = (v) => {
    const t = v.trim()
    if (t && !values.includes(t)) onChange([...values, t])
    setInput('')
  }
  const unused = suggestions.filter((s) => !values.includes(s))
  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {values.map((v) => (
          <li key={v}>
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}
              className="inline-flex items-center gap-1.5 rounded-xs border border-ink bg-ink px-2.5 py-1.5 text-[12px] text-page">
              {v} <Icon name="close" size={11} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex gap-2">
        <input className="field h-9" value={input} placeholder="Add and press enter"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input) } }} />
        <Button size="sm" variant="quiet" onClick={() => add(input)}>Add</Button>
      </div>
      {unused.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s)}
                className="rounded-xs border border-line px-2 py-1 text-[11px] text-faint hover:border-ink hover:text-ink">
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SwatchEditor({ values, swatches, onChange }) {
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#cccccc')

  const add = () => {
    const t = name.trim()
    if (!t || values.includes(t)) return
    onChange([...values, t], { ...swatches, [t]: hex })
    setName('')
  }

  return (
    <div>
      <ul className="space-y-2">
        {values.map((v) => (
          <li key={v} className="flex items-center gap-3">
            <input type="color" value={swatches[v] || '#cccccc'} aria-label={`${v} swatch`}
              onChange={(e) => onChange(values, { ...swatches, [v]: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-xs border border-line bg-surface p-1" />
            <span className="flex-1 text-[14px]">{v}</span>
            <span className="font-mono text-[11px] text-faint">{swatches[v]}</span>
            <IconBtn label={`Remove ${v}`} icon="trash" tone="sale"
              onClick={() => onChange(values.filter((x) => x !== v), swatches)} />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} aria-label="New swatch colour"
          className="h-9 w-12 cursor-pointer rounded-xs border border-line bg-surface p-1" />
        <input className="field h-9" value={name} placeholder="Colour name, e.g. Ecru"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button size="sm" variant="quiet" onClick={add}>Add</Button>
      </div>
    </div>
  )
}

function CompositionEditor({ value, onChange }) {
  const total = value.reduce((a, [, pct]) => a + Number(pct || 0), 0)
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium">Composition</label>
      <ul className="space-y-2">
        {value.map(([material, pct], i) => (
          <li key={i} className="flex gap-2">
            <input className="field" value={material} placeholder="Extra-fine merino wool"
              onChange={(e) => onChange(value.map((row, k) => (k === i ? [e.target.value, row[1]] : row)))} />
            <input type="number" min="0" max="100" className="field w-24 tabular-nums" value={pct}
              onChange={(e) => onChange(value.map((row, k) => (k === i ? [row[0], Number(e.target.value)] : row)))} />
            <IconBtn label="Remove" icon="trash" tone="sale" onClick={() => onChange(value.filter((_, k) => k !== i))} />
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-center gap-3">
        <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...value, ['', 0]])}>Add material</Button>
        {value.length > 0 && (
          <span className={`text-[12px] ${total === 100 ? 'text-faint' : 'text-sale'}`}>
            {total}% {total === 100 ? '' : '— should be 100'}
          </span>
        )}
      </div>
    </div>
  )
}
