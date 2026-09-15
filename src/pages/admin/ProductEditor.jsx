import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api, { isMock } from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, ErrorState, Icon, Skeleton } from '../../components/ui/index.jsx'
import Media from '../../components/ui/Media.jsx'
import * as media from '../../lib/media.js'
import { Hint } from '../../components/admin/Tour.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import ProductPreview from '../../components/admin/ProductPreview.jsx'
import EnrichmentTab from '../../components/admin/EnrichmentTab.jsx'
import { formatMoney, toMinor, toMajor } from '../../lib/money.js'
import { slugify, slugProblem } from '../../lib/slug.js'
import { specLabel } from '../../data/attributes.js'
import {
  colourOptionOf, droppedSpecs, editorTabs, fallbackType, frequentTags, isApparelType, knownSwatches,
  missingCombinations, moveOption, optionAxes, optionNameProblem, optionNameSuggestions, optionsUntouched,
  removeOption, renameOption, resolveProductType, setOptionValues, showCompliance, starterOptions, tabForError,
  typeChangeWarning, typeOptionLabel, valueSuggestions, variantIdentity, variantLabel,
} from '../../lib/product-types.js'

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
  // No options until the type is known: a table is not sold in Colour and Size.
  // A new product whose type is worn and sized is given those two, empty, to start from.
  options: [],
  swatches: {},
  variants: [],
  categories: [],
  rating: { average: 0, count: 0 },
  productTypeId: null,
  fit: null,
  fabric: null,
  sizeChartId: null,
  social: null,
  relatedSlugs: [],
  published: false,
  createdAt: new Date().toISOString(),
})

const SIZE_SUGGESTIONS = ['XS', 'S', 'M', 'L', 'XL', 'One Size']
const APPAREL_TAGS = ['cotton', 'linen', 'merino', 'cashmere', 'wool', 'silk', 'denim', 'leather', 'everyday', 'summer', 'winter', 'organic', 'recycled']

/*
 * Unsaved work is kept in this browser until it is saved or discarded, so a
 * reload — a dev server picking up a code change, a crashed tab — does not
 * cost the product that was being typed in.
 */
const DRAFT_MAX_AGE = 7 * 24 * 3600 * 1000
const draftKey = (id) => `loom.admin.draft.${id}`

function readDraft(id) {
  try {
    const kept = JSON.parse(localStorage.getItem(draftKey(id)) || 'null')
    return kept?.draft && Date.now() - kept.savedAt < DRAFT_MAX_AGE ? kept : null
  } catch {
    return null
  }
}

function writeDraft(id, draft) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ savedAt: Date.now(), draft }))
  } catch {
    // Storage full or blocked: the editor still works, it just cannot survive a reload.
  }
}

function forgetDraft(id) {
  try {
    localStorage.removeItem(draftKey(id))
  } catch {
    // Nothing to forget.
  }
}

// A real backend stores photographs; the local demo also plays video.
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const UPLOAD_ACCEPT = isMock ? 'image/*,video/*' : UPLOAD_TYPES.join(',')

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

export default function ProductEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { push } = useToast()

  const loaded = useAsync(() => api.adminGetProduct(id), [id], { skip: isNew })
  const charts = useAsync(() => api.listSizeCharts(), [])
  const vocab = useAsync(() => api.listAttributes(), [])
  const cats = useAsync(() => api.adminListCategories(), [])
  // For the manual "You might also like" rail. Drafts included, because a
  // merchant preparing a launch wants to wire the rail before publishing.
  const catalogue = useAsync(() => api.adminListProducts({ perPage: 500 }), [])
  // Product types, and the option names and values the store already uses.
  const library = useAsync(() => api.listLibrary(), [])

  const [draft, setDraft] = useState(() => (isNew ? readDraft('new')?.draft || BLANK() : null))
  const [tab, setTab] = useState('details')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(() => isNew && Boolean(readDraft('new')))
  const [restoredAt, setRestoredAt] = useState(() => (isNew ? readDraft('new')?.savedAt : null) || null)
  const [previewing, setPreviewing] = useState(false)

  /*
   * The product's type decides which tabs and panels exist and what they are
   * called. With no type to go on (a backend that predates them, a library that
   * did not load) the editor keeps its old guess: clothing in the demo, on a
   * store with size charts, or for a product that already has fit or fabric.
   */
  const types = useMemo(() => library.data?.productTypes || [], [library.data])
  const defaultTypeId = library.data?.defaultProductTypeId ?? null
  const resolved = draft
    ? resolveProductType({ productTypeId: draft.productTypeId, productType: draft.productType, types, defaultId: defaultTypeId, isNew })
    : null
  const legacyApparel = isMock || Boolean(draft?.fit || draft?.fabric || draft?.sizeChartId || charts.data?.items?.length)
  const type = resolved || fallbackType(legacyApparel)
  const tabs = editorTabs(type.blocks, type.labels)
  const visibleTabs = tabs.map(([k]) => k)
  const activeTab = visibleTabs.includes(tab) ? tab : 'details'

  // A new product takes the store's default type, and starts with empty Colour
  // and Size only if that type is worn and sized. Not a change of its own, so
  // it does not mark the draft unsaved.
  useEffect(() => {
    if (!isNew || !draft || draft.productTypeId != null || defaultTypeId == null) return
    const start = resolveProductType({ productTypeId: defaultTypeId, types })
    setDraft((d) => ({
      ...d,
      productTypeId: String(defaultTypeId),
      ...(!(d.options || []).length && !(d.variants || []).length ? { options: starterOptions(start) } : {}),
    }))
  }, [isNew, draft, defaultTypeId, types])

  useEffect(() => {
    if (!loaded.data || draft) return
    const kept = readDraft(id)
    setDraft(kept ? kept.draft : structuredClone(loaded.data))
    if (kept) {
      setDirty(true)
      setRestoredAt(kept.savedAt)
    }
  }, [loaded.data, draft, id])

  useEffect(() => {
    if (dirty && draft) writeDraft(id, draft)
  }, [dirty, draft, id])

  const discardChanges = () => {
    forgetDraft(id)
    setRestoredAt(null)
    setDirty(false)
    setDraft(isNew ? BLANK() : structuredClone(loaded.data))
  }

  // Saving a new product replaces `new` in the URL with its id. The draft in
  // hand is already correct, so adopting the refetch would only throw away
  // anything typed since — keep what is on screen.
  useEffect(() => {
    if (!isNew) return
    setDraft((d) => d)
  }, [isNew])

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

  /**
   * Commit the draft. `then` decides where we go afterwards.
   *
   * Preview goes through here too. A preview that does not persist is a way to
   * lose an hour's work to a stray reload, and "look at it" is not a reason to
   * risk that — a new product saved this way is created as a draft, so nothing
   * reaches a shopper before you mean it to.
   */
  const commit = async ({ then = 'list' } = {}) => {
    if (!draft.slug || !draft.title) {
      push('A title and a slug are required before this can be saved.', { tone: 'error' })
      setTab('details')
      return false
    }
    // A dash left over from typing is tidied here rather than refused.
    const slug = slugify(draft.slug)
    const problem = slugProblem(slug, { allowTrailingNumber: isMock })
    if (problem) {
      push(problem, { tone: 'error' })
      setTab('details')
      return false
    }
    const payload = slug === draft.slug ? draft : { ...draft, slug }
    if (payload !== draft) setDraft(payload)
    // The resolved type is for reading; the backend is sent its id, and a new
    // product the default type it was shown with.
    const { productType: _resolvedType, ...body } = payload
    if (body.productTypeId == null && resolved?.id != null && isNew) body.productTypeId = resolved.id
    setBusy(true)
    try {
      const saved = await api.adminSaveProduct(body)
      forgetDraft(id)
      setRestoredAt(null)
      setDirty(false)
      if (then === 'list') {
        push(isNew ? 'Product created' : 'Saved')
        navigate('/admin/products')
      } else {
        push(isNew ? 'Created as a draft' : 'Saved')
        // A new product now has an id, so the URL has to stop saying "new" —
        // otherwise the next save creates a second product.
        if (isNew && saved?.id) navigate(`/admin/products/${saved.id}`, { replace: true })
      }
      return true
    } catch (err) {
      push(err.message, { tone: 'error' })
      const fix = tabForError(err.code, visibleTabs)
      if (fix) setTab(fix)
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = () => commit({ then: 'list' })

  const preview = async () => {
    if (!dirty) {
      setPreviewing(true)
      return
    }
    if (await commit({ then: 'stay' })) setPreviewing(true)
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api.adminDeleteProduct(draft.id || draft.slug)
      forgetDraft(id)
      push('Product deleted')
      navigate('/admin/products')
    } catch (err) {
      push(err.message, { tone: 'error' })
      setBusy(false)
    }
  }

  if (loaded.error && !draft) return <ErrorState error={loaded.error} onRetry={() => loaded.reload()} />
  if (loaded.loading || !draft) return <Skeleton className="h-96 w-full" />

  /**
   * Change the product's type. On a saved product this is not cosmetic: the
   * backend keeps only the specifications the new type defines, so it asks
   * first and names what would go.
   */
  const changeType = (nextId) => {
    const raw = types.find((t) => String(t.id) === String(nextId))
    const next = resolveProductType({ productTypeId: nextId, types })
    if (!raw || !next || String(nextId) === String(resolved?.id ?? '')) return
    const savedId = loaded.data?.productTypeId
    if (!isNew && String(savedId ?? '') !== String(nextId)) {
      const warning = typeChangeWarning({
        from: resolved,
        to: next,
        specs: draft.enrichment?.specs,
        label: (key) => specLabel(key, draft.enrichment?.specList),
      })
      if (!window.confirm(warning)) return
    }
    set('productTypeId', next.id)
    set('productType', raw)
    // A new product's untouched starting options follow the type: Colour and Size for clothes, nothing for a table.
    if (isNew && optionsUntouched(draft)) set('options', starterOptions(next))
  }

  const known = library.data?.options || []
  const colour = colourOptionOf(draft.options || [], known)
  const props = {
    draft,
    set,
    type,
    known,
    charts: charts.data?.items || [],
    cats: cats.data?.items || [],
    catalogue: (catalogue.data?.items || []).filter((p) => p.slug !== draft.slug),
  }

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
        <div className="flex flex-wrap items-center gap-3">
          {dirty && (
            <span className="rounded-xs bg-accent-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              Unsaved
            </span>
          )}

          {/* Publish state reads at a glance and flips in one click. Buried
              three tabs down it is the setting people forget. */}
          <button
            type="button"
            onClick={() => set('published', draft.published === false)}
            aria-pressed={draft.published !== false}
            className={`inline-flex items-center gap-2 rounded-xs border px-3 py-1.5 text-[12px] transition-colors ${
              draft.published !== false
                ? 'border-good/40 bg-good/10 text-good hover:border-good'
                : 'border-line bg-sunken text-muted hover:border-ink hover:text-ink'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${draft.published !== false ? 'bg-good' : 'bg-faint'}`} />
            {draft.published !== false ? 'Published' : 'Draft'}
          </button>

          <button
            type="button"
            onClick={preview}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xs border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
          >
            <Icon name="search" size={13} />
            {dirty ? 'Save & preview' : 'Preview'}
          </button>

          {/* The live page, for comparison. Only exists once something is
              saved, and only useful when it is published. */}
          {!isNew && draft.slug && draft.published !== false && (
            <a
              href={`/product/${draft.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-faint transition-colors hover:text-ink"
            >
              Live page <Icon name="arrow-right" size={13} />
            </a>
          )}
        </div>
      </div>

      {restoredAt && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xs border border-line bg-sunken px-4 py-3 text-[13px]">
          <span>
            Unsaved changes from {new Date(restoredAt).toLocaleString()} were restored. Save to keep them.
          </span>
          <button type="button" onClick={discardChanges} className="text-[12px] text-muted link-underline">
            Discard them
          </button>
        </div>
      )}

      <div className="mt-7 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={activeTab === k}
            onClick={() => setTab(k)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[13px] transition-colors ${
              activeTab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`mt-8 ${activeTab === 'enrichment' ? '' : 'max-w-3xl'}`}>
        {activeTab === 'details' && (
          <DetailsTab
            {...props}
            isNew={isNew}
            types={types}
            resolved={resolved}
            savedTypeId={loaded.data?.productTypeId ?? null}
            onChangeType={changeType}
          />
        )}
        {activeTab === 'media' && <MediaTab {...props} colourName={colour?.name || null} />}
        {activeTab === 'variants' && <VariantsTab {...props} />}
        {activeTab === 'fit' && <FitTab {...props} />}
        {activeTab === 'enrichment' && (
          <EnrichmentTab
            draft={draft}
            set={set}
            attributes={vocab.data?.items || []}
            icons={vocab.data?.icons || []}
            assuranceTemplates={vocab.data?.assurances || []}
            featurePresets={vocab.data?.features || []}
            specKeys={resolved?.specKeys || []}
            typeName={resolved?.name || null}
            compliance={showCompliance(type.blocks, draft.enrichment)}
            onSaveToLibrary={async (kind, item) => {
              try {
                await api.saveLibraryItem({ kind, item })
                vocab.reload()
                push('Saved for reuse on other products')
              } catch (err) {
                push(err.message, { tone: 'error' })
              }
            }}
          />
        )}
        {activeTab === 'organise' && <OrganiseTab {...props} />}
      </div>

      <ProductPreview
        draft={draft}
        charts={charts.data?.items || []}
        productType={resolved}
        open={previewing}
        onClose={() => setPreviewing(false)}
      />

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

function DetailsTab({ draft, set, isNew, type, types = [], resolved, savedTypeId, onChangeType }) {
  const currency = draft.price?.currency || 'USD'
  const { labels } = type
  const apparel = isApparelType(type)
  // The product's own type stays choosable even if the library did not list it.
  const choices = resolved && !types.some((t) => String(t.id) === resolved.id) ? [resolved, ...types] : types
  const changed = !isNew && resolved && String(savedTypeId ?? '') !== resolved.id
  const losing = changed ? droppedSpecs(draft.enrichment?.specs, resolved) : []
  return (
    <div className="space-y-8">
      {choices.length > 0 && (
        <Panel
          title="Product type"
          note={`Decides what this product's page shows: fit, size chart, materials, compliance, and its specifications. ${
            isMock ? 'On Odoo it is set per category; the demo has three fixed types.' : 'Set per category in Odoo.'
          }`}
        >
          <div>
            <label htmlFor="f-product-type" className="mb-1.5 block text-[13px] font-medium">Type</label>
            <select
              id="f-product-type"
              className="field"
              value={resolved?.id ?? ''}
              onChange={(e) => e.target.value && onChangeType(e.target.value)}
            >
              {!resolved && <option value="">Choose a type…</option>}
              {choices.map((t) => (
                <option key={t.id} value={String(t.id)}>{typeOptionLabel(t)}</option>
              ))}
            </select>
            {changed && (
              <p className="mt-1.5 text-[12px] text-accent">
                Changed — saving applies it.
                {losing.length > 0 &&
                  ` These specifications are removed because ${resolved.name} does not define them: ${losing
                    .map((k) => specLabel(k, draft.enrichment?.specList))
                    .join(', ')}.`}
              </p>
            )}
          </div>
        </Panel>
      )}

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
          onChange={(v) => set('slug', slugify(v, { typing: true }))}
          onBlur={() => draft.slug !== slugify(draft.slug) && set('slug', slugify(draft.slug))}
          error={slugProblem(slugify(draft.slug), { allowTrailingNumber: isMock })}
          hint="The web address: /product/your-slug. Changing it on a live product breaks existing links and ads."
        />
        <Text label="Subtitle" value={draft.subtitle} onChange={(v) => set('subtitle', v)}
          hint="One line under the title: what it is, or what it is made of. Not a sales line." />
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

      <Panel
        title={`${labels.details} and ${lowerFirst(labels.care)}`}
        note={`Shown on the product page under ${labels.details} and ${labels.care}. One line each.`}
      >
        <ListEditor label={labels.details} items={draft.details} onChange={(v) => set('details', v)}
          placeholder={apparel ? '140gsm long-staple cotton oxford' : 'One fact per line'} />
        <ListEditor label={labels.care} items={draft.care} onChange={(v) => set('care', v)}
          placeholder={apparel ? 'Machine wash cold, gentle' : 'e.g. Keep out of direct sunlight'} />
      </Panel>

      <Panel title="Badges" note="Sale, sold-out and low-stock are worked out from price and stock. These two are yours.">
        <div className="flex flex-wrap gap-2">
          {['new', 'bestseller'].map((b) => {
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

function MediaTab({ draft, set, colourName }) {
  // Shots are tagged with a value of the product's colour option, whatever it is called.
  const colors = (colourName && draft.options?.find((o) => o.name === colourName)?.values) || []
  const images = useMemo(() => draft.images || [], [draft.images])
  const [busy, setBusy] = useState(false)
  // Two separate drags happen in this panel: files arriving from the desktop,
  // and tiles being reordered within it. Sharing one state meant dragging a
  // tile across the drop zone replaced the index and the reorder silently did
  // nothing.
  const [dragIndex, setDragIndex] = useState(null)
  const [dropActive, setDropActive] = useState(false)
  const [selected, setSelected] = useState([])
  const [assignTo, setAssignTo] = useState('')
  const { push } = useToast()
  const inputRef = useRef(null)

  useEffect(() => {
    media.preload(images.map((i) => i.url))
  }, [images])

  /**
   * Multi-file upload.
   *
   * Files are processed in sequence rather than in parallel: each one is
   * decoded to a bitmap and re-encoded through a canvas, and ten of those at
   * once will stall the tab on a phone. Sequential is slower and stays
   * responsive, which is the right trade for an upload button.
   */
  const onFiles = async (fileList) => {
    const files = [...fileList]
    if (!files.length) return
    setBusy(true)
    const added = []
    for (const file of files) {
      if (!isMock && !UPLOAD_TYPES.includes(file.type)) {
        push(`${file.name}: only JPEG, PNG, WebP or GIF images can be uploaded.`, { tone: 'error' })
        continue
      }
      try {
        const m = await api.uploadMedia(file)
        added.push({
          id: m.id,
          url: m.url,
          type: m.type,
          alt: '',
          width: m.width,
          height: m.height,
          duration: m.duration ?? undefined,
        })
      } catch (err) {
        push(err.message, { tone: 'error' })
      }
    }
    if (added.length) {
      set('images', [...images, ...added])
      push(`${added.length} file${added.length === 1 ? '' : 's'} added`)
    }
    setBusy(false)
  }

  const patch = (i, key, value) =>
    set('images', images.map((img, k) => (k === i ? { ...img, [key]: value } : img)))

  const move = (from, to) => {
    if (to < 0 || to >= images.length || from === to) return
    const next = images.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    set('images', next)
  }

  const removeAt = (i) => {
    const img = images[i]
    set('images', images.filter((_, k) => k !== i))
    setSelected((sel) => sel.filter((id) => id !== img.id))
    // Variants pointing at a deleted shot fall back to the first one, rather
    // than referencing something that is no longer there.
    if (img.id) {
      set(
        'variants',
        (draft.variants || []).map((v) =>
          v.imageId === img.id ? { ...v, imageId: images[0]?.id ?? null } : v,
        ),
      )
    }
  }

  const toggleSelect = (id) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))

  /** Tag the selected shots with a colour and repoint that colour's variants. */
  const assign = () => {
    if (!assignTo || !selected.length) return
    set('images', images.map((img) => (selected.includes(img.id) ? { ...img, color: assignTo } : img)))
    const first = selected[0]
    set(
      'variants',
      (draft.variants || []).map((v) => (colourName && v.options?.[colourName] === assignTo ? { ...v, imageId: first } : v)),
    )
    push(`${selected.length} assigned to ${assignTo}`)
    setSelected([])
    setAssignTo('')
  }

  return (
    <div className="space-y-8">
      <Panel
        title="Media"
        note={`Shot 4:5 (900 × 1125). The first is the card image; the second is what the grid swaps to on hover — a close-up or the product in use works well.${isMock ? ' Video is supported and plays with controls on the product page.' : ''}`}
      >
        {/* Drop zone. Also the upload button, because a drop target nobody can
            click is a drop target half the people who need it will miss. */}
        <div
          onDragOver={(e) => {
            // Only light up for files from outside. A tile being dragged past
            // on its way somewhere else is not a drop.
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setDropActive(true)
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDropActive(false)
            if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
          }}
          className={`rounded-xs border-2 border-dashed p-8 text-center transition-colors ${
            dropActive ? 'border-accent bg-accent-soft/40' : 'border-line'
          }`}
        >
          <Icon name="package" size={22} className="mx-auto text-faint" />
          <p className="mt-3 text-[14px] text-ink">
            {busy ? 'Processing…' : isMock ? 'Drop images or video here' : 'Drop images here'}
          </p>
          <p className="mt-1 text-[12px] text-faint">
            {isMock
              ? 'Several at once. Images are resized to 1600px and re-encoded; video up to 25MB.'
              : 'Several at once. JPEG, PNG, WebP or GIF, up to 10MB each.'}
          </p>
          <Button
            size="sm"
            variant="quiet"
            icon="plus"
            className="mt-4"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {images.length > 0 && (
          <>
            {/* Bulk assignment. Uploading twelve shots and tagging each one by
                hand is the part of this job people abandon. */}
            <div className="flex flex-wrap items-center gap-3 rounded-xs border border-line bg-sunken/40 p-3">
              <span className="text-[13px] text-muted">
                {selected.length ? `${selected.length} selected` : 'Select shots to assign in bulk'}
              </span>
              {selected.length > 0 && colors.length > 0 && (
                <>
                  <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="field h-8 w-auto py-0 text-[13px]">
                    <option value="">Assign to colour…</option>
                    {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Button size="sm" onClick={assign} disabled={!assignTo}>Assign</Button>
                </>
              )}
              {selected.length > 0 && (
                <button type="button" onClick={() => setSelected([])} className="text-[12px] text-faint link-underline">
                  Clear
                </button>
              )}
              <span className="ml-auto text-[12px] text-faint">Drag a tile to reorder</span>
            </div>

            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img, i) => (
                <li
                  key={img.id || i}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={() => setDragIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex !== null) move(dragIndex, i)
                    setDragIndex(null)
                  }}
                  className={`rounded-xs border bg-surface transition-all ${
                    dragIndex === i ? 'opacity-40' : ''
                  } ${selected.includes(img.id) ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => img.id && toggleSelect(img.id)}
                      aria-pressed={selected.includes(img.id)}
                      aria-label={`Select image ${i + 1}`}
                      className="block w-full cursor-grab active:cursor-grabbing"
                    >
                      <div className="shot rounded-t-xs">
                        <Media src={img.url} type={img.type} alt={img.alt} className="h-full w-full object-cover" />
                      </div>
                    </button>

                    <span className="absolute left-2 top-2 flex gap-1">
                      {i === 0 && <Tag>Card</Tag>}
                      {i === 1 && <Tag>Hover</Tag>}
                      {img.type === 'video' && <Tag>Video</Tag>}
                      {img.color && <Tag>{img.color}</Tag>}
                    </span>

                    <span className="absolute right-2 top-2 flex gap-1">
                      <TileBtn label="Move earlier" icon="chevron-left" onClick={() => move(i, i - 1)} />
                      <TileBtn label="Move later" icon="chevron-right" onClick={() => move(i, i + 1)} />
                      <TileBtn label="Remove" icon="trash" tone="sale" onClick={() => removeAt(i)} />
                    </span>
                  </div>

                  <div className="space-y-2 p-3">
                    <input
                      className="field h-8 text-[12px]"
                      placeholder="Alt text — describe the product"
                      value={img.alt || ''}
                      onChange={(e) => patch(i, 'alt', e.target.value)}
                    />
                    {colors.length > 0 && (
                      <select
                        className="field h-8 py-0 text-[12px]"
                        value={img.color || ''}
                        onChange={(e) => patch(i, 'color', e.target.value || undefined)}
                      >
                        <option value="">All colours</option>
                        {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <p className="font-mono text-[10px] text-faint">
                      {img.width && img.height ? `${img.width}×${img.height}` : 'size unknown'}
                      {img.duration ? ` · ${Math.round(img.duration)}s` : ''}
                      {img.width && img.height && img.type !== 'video' && (
                        <span className={Math.abs(img.width / img.height - 0.8) > 0.06 ? 'text-sale' : ''}>
                          {' · '}
                          {(img.width / img.height).toFixed(2)}
                          {Math.abs(img.width / img.height - 0.8) > 0.06 ? ' (not 4:5)' : ''}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Local data only. A real backend stores uploads, and a pasted link
            is not something it can keep. */}
        {isMock && (
        <details className="rounded-xs border border-line p-4">
          <summary className="cursor-pointer text-[13px] font-medium">Or paste a URL</summary>
          <p className="mt-2 text-[12px] leading-relaxed text-faint">
            Uploads are held in this browser, which is right for a demo and wrong for a shop. In
            production the same button posts to your upload endpoint and the product stores the URL
            it returns. A CDN path pasted here works today.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="field h-9 font-mono text-[12px]"
              placeholder="https://cdn.example.com/shot.jpg"
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !e.target.value.trim()) return
                e.preventDefault()
                set('images', [
                  ...images,
                  {
                    id: `img_${Math.random().toString(36).slice(2, 8)}`,
                    url: e.target.value.trim(),
                    alt: '',
                    width: 900,
                    height: 1125,
                  },
                ])
                e.target.value = ''
              }}
            />
          </div>
        </details>
        )}
      </Panel>
    </div>
  )
}

function Tag({ children }) {
  return (
    <span className="rounded-xs bg-ink/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-page backdrop-blur">
      {children}
    </span>
  )
}

function TileBtn({ label, icon, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-6 w-6 place-items-center rounded-xs bg-surface/90 backdrop-blur transition-colors hover:bg-surface ${
        tone === 'sale' ? 'text-sale' : 'text-muted'
      }`}
    >
      <Icon name={icon} size={12} />
    </button>
  )
}

/* ── variants ──────────────────────────────────────────────────────────── */

function VariantsTab({ draft, set, type, known = [] }) {
  const options = useMemo(() => draft.options || [], [draft.options])
  const variants = useMemo(() => draft.variants || [], [draft.variants])
  const images = useMemo(() => draft.images || [], [draft.images])
  const names = options.map((o) => o.name)
  const axes = optionAxes(options)
  const colour = colourOptionOf(options, known)
  const apparel = isApparelType(type)
  const [picked, setPicked] = useState([])
  const [bulk, setBulk] = useState({ mode: 'set-stock', value: '', scope: 'all' })
  const { push } = useToast()

  const label = (v) => variantLabel(v, names)

  const removeVariants = (ids) => {
    const drop = new Set(ids)
    set('variants', variants.filter((v) => !drop.has(v.id)))
    setPicked((sel) => sel.filter((id) => !drop.has(id)))
  }

  const dropped = (removed) => {
    if (!removed.length) return
    setPicked((sel) => sel.filter((id) => !removed.some((v) => v.id === id)))
    push(`${removed.length} variant${removed.length === 1 ? '' : 's'} removed with it`)
  }

  /**
   * Change one option's values.
   *
   * Only that option is touched — every other option and its rows stay as they
   * are. Rows for a value that is gone go with it: a row pointing at a value the
   * product no longer has cannot be saved.
   */
  const setValues = (name, values, swatches) => {
    const next = setOptionValues(draft, name, values, swatches || draft.swatches)
    set('options', next.options)
    if (swatches) set('swatches', swatches)
    if (next.removed.length) {
      set('variants', next.variants)
      dropped(next.removed)
    }
  }

  const addOption = (name) => {
    const problem = optionNameProblem(name, options)
    if (problem) {
      push(problem, { tone: 'error' })
      return false
    }
    set('options', [...options, { name: name.trim(), values: [] }])
    return true
  }

  const rename = (from, to) => {
    if (String(to).trim() === from) return true
    const problem = optionNameProblem(to, options, from)
    if (problem) {
      push(problem, { tone: 'error' })
      return false
    }
    const next = renameOption(draft, from, to)
    set('options', next.options)
    set('variants', next.variants)
    return true
  }

  /** Removing a whole option says what happens to the rows that use it before doing it. */
  const dropOption = (name) => {
    const next = removeOption(draft, name)
    if (
      next.removed.length &&
      !window.confirm(
        `Remove the option “${name}”? The ${next.removed.length} variant${next.removed.length === 1 ? '' : 's'} using it ${
          next.removed.length === 1 ? 'is' : 'are'
        } removed too, with ${next.removed.length === 1 ? 'its' : 'their'} stock and prices. You can add the combinations again afterwards.`,
      )
    ) {
      return
    }
    set('options', next.options)
    if (next.removed.length) {
      set('variants', next.variants)
      setPicked((sel) => sel.filter((id) => next.variants.some((v) => v.id === id)))
    }
  }

  /** A row for one combination of the product's options. */
  const makeVariant = (combo, taken) => {
    const { id, sku } = variantIdentity({ slug: draft.slug, combo, colourName: colour?.name, taken })
    const shade = colour ? combo[colour.name] : null
    return {
      id,
      sku,
      options: combo,
      price: draft.price,
      compareAtPrice: draft.compareAtPrice,
      inventory: 0,
      available: false,
      // Prefer a shot tagged with this colour, so a store with per-colour
      // photography wires itself up without anyone picking image ids.
      imageId: images.find((img) => shade != null && img.color === shade)?.id || images[0]?.id || null,
    }
  }

  /**
   * Combinations that exist as options but have no row.
   *
   * Not every colour comes in every size, not every grind in every weight. So
   * the matrix is deliberately allowed to be sparse, and this is a list of what
   * is missing rather than a warning that something is wrong. Adding is
   * explicit; nothing is resurrected behind your back.
   */
  const missing = useMemo(() => missingCombinations(options, variants), [options, variants])

  const addCombos = (combos) => {
    const taken = variants.map((v) => v.id)
    const rows = combos.map((combo) => {
      const row = makeVariant(combo, taken)
      taken.push(row.id)
      return row
    })
    set('variants', [...variants, ...rows])
  }

  const patchVariant = (id, key, value) =>
    set(
      'variants',
      variants.map((v) =>
        v.id === id
          ? { ...v, [key]: value, ...(key === 'inventory' ? { available: Number(value) > 0 } : {}) }
          : v,
      ),
    )

  /** Which rows a bulk action applies to: everything, one value of one option, or a manual pick. */
  const inScope = (v) => {
    if (bulk.scope === 'picked') return picked.includes(v.id)
    if (bulk.scope === 'all') return true
    const [name, value] = JSON.parse(bulk.scope)
    return v.options?.[name] === value
  }
  const scoped = variants.filter(inScope)

  const applyBulk = () => {
    const n = Number(bulk.value)
    if (!scoped.length) return
    if (bulk.mode !== 'image' && !Number.isFinite(n)) {
      push('Enter a number first.', { tone: 'error' })
      return
    }

    const next = variants.map((v) => {
      if (!inScope(v)) return v
      switch (bulk.mode) {
        case 'set-stock':
          return { ...v, inventory: Math.max(0, n), available: n > 0 }
        case 'add-stock': {
          const q = Math.max(0, v.inventory + n)
          return { ...v, inventory: q, available: q > 0 }
        }
        case 'set-price':
          return { ...v, price: { amount: toMinor(n), currency: draft.price.currency } }
        case 'adjust-price': {
          // "All XL, three pounds more" — the reason this control exists.
          const amount = Math.max(0, (v.price?.amount ?? draft.price.amount) + toMinor(n))
          return { ...v, price: { amount, currency: draft.price.currency } }
        }
        case 'image':
          return { ...v, imageId: bulk.value || null }
        default:
          return v
      }
    })
    set('variants', next)
    push(`${scoped.length} variant${scoped.length === 1 ? '' : 's'} updated`)
    setBulk((b) => ({ ...b, value: '' }))
  }

  const allPicked = picked.length === variants.length && variants.length > 0
  const nameSuggestions = optionNameSuggestions(known, type?.id ?? null, names, apparel ? ['Color', 'Size'] : [])

  return (
    <div className="space-y-8">
      <Panel
        title="Options"
        note={
          apparel
            ? 'What a shopper chooses between: a colour, a size, a length. A colour option is picked from swatches — pick something close to the real thing; any other option from its values.'
            : 'What a shopper chooses between: a weight, a grind, a finish, a size. A colour option is picked from swatches; any other option from its values. A product with no options is sold as it is.'
        }
      >
        <datalist id="option-names">
          {nameSuggestions.map((n) => <option key={n} value={n} />)}
        </datalist>

        {options.length > 0 && (
          <ul className="space-y-3">
            {options.map((o, i) => (
              <OptionCard
                key={o.name}
                option={o}
                index={i}
                count={options.length}
                colour={colour?.name === o.name || isColourName(o, known)}
                swatches={draft.swatches || {}}
                known={known}
                apparel={apparel}
                onRename={rename}
                onValues={setValues}
                onMove={(from, to) => set('options', moveOption(options, from, to))}
                onRemove={dropOption}
              />
            ))}
          </ul>
        )}

        <AddOption suggestions={nameSuggestions} onAdd={addOption} empty={!options.length} />
      </Panel>

      <Panel
        title="Variants"
        note="One row per combination you sell. Stock lives here, not on the product — which is what lets the picker grey out only the choices that are gone in what a shopper has already picked."
      >
        {missing.length > 0 && (
          <div className="rounded-xs border border-line bg-sunken/40 p-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-muted">
                {axes.length
                  ? `${missing.length} combination${missing.length === 1 ? '' : 's'} not created`
                  : 'No options, so this product is sold as one variant.'}
              </p>
              <Button size="sm" variant="quiet" onClick={() => addCombos(missing)} className="ml-auto">
                {axes.length ? 'Add all' : 'Add the variant'}
              </Button>
            </div>
            {axes.length > 0 && (
              <>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {missing.slice(0, 24).map((combo) => (
                    <li key={JSON.stringify(combo)}>
                      <button
                        type="button"
                        onClick={() => addCombos([combo])}
                        className="inline-flex items-center gap-1 rounded-xs border border-line px-2 py-1 text-[11px] text-faint transition-colors hover:border-ink hover:text-ink"
                      >
                        <Icon name="plus" size={10} />
                        {variantLabel({ options: combo }, names)}
                      </button>
                    </li>
                  ))}
                  {missing.length > 24 && <li className="self-center text-[11px] text-faint">+{missing.length - 24} more</li>}
                </ul>
                <p className="mt-2.5 text-[12px] leading-relaxed text-faint">
                  A sparse matrix is normal — not every combination is made. Nothing is added until you
                  ask for it.
                </p>
              </>
            )}
          </div>
        )}

        {variants.length === 0 ? (
          <p className="rounded-xs border border-dashed border-line p-6 text-center text-[13px] text-faint">
            {options.length ? 'Give the options their values, then add the combinations you sell.' : 'No variants yet.'}
          </p>
        ) : (
          <>
            {/* Bulk editor. Typing a number into ninety rows is the reason
                people give up on a variant matrix. */}
            <div className="space-y-3 rounded-xs border border-line bg-sunken/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Bulk action"
                  className="field h-9 w-auto py-0 text-[13px]"
                  value={bulk.mode}
                  onChange={(e) => setBulk((b) => ({ ...b, mode: e.target.value, value: '' }))}
                >
                  <option value="set-stock">Set stock to</option>
                  <option value="add-stock">Add to stock</option>
                  <option value="set-price">Set price to</option>
                  <option value="adjust-price">Adjust price by</option>
                  <option value="image">Use image</option>
                </select>

                {bulk.mode === 'image' ? (
                  <select
                    aria-label="Image"
                    className="field h-9 w-auto py-0 text-[13px]"
                    value={bulk.value}
                    onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}
                  >
                    <option value="">Choose a shot…</option>
                    {images.map((img, i) => (
                      <option key={img.id} value={img.id}>
                        {i + 1}. {img.alt || img.name || img.id}
                        {img.color ? ` (${img.color})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Value"
                    type="number"
                    step={bulk.mode.includes('price') ? '0.01' : '1'}
                    className="field h-9 w-28 tabular-nums"
                    placeholder={bulk.mode === 'adjust-price' ? '+3.00' : '0'}
                    value={bulk.value}
                    onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))}
                  />
                )}

                <span className="text-[13px] text-muted">for</span>

                <select
                  aria-label="Scope"
                  className="field h-9 w-auto py-0 text-[13px]"
                  value={bulk.scope}
                  onChange={(e) => setBulk((b) => ({ ...b, scope: e.target.value }))}
                >
                  <option value="all">every variant</option>
                  {picked.length > 0 && <option value="picked">the {picked.length} selected</option>}
                  {axes.map((o) => (
                    <optgroup key={o.name} label={o.name}>
                      {o.values.map((v) => (
                        <option key={v} value={JSON.stringify([o.name, v])}>all {v}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <Button size="sm" onClick={applyBulk} disabled={!scoped.length}>
                  Apply to {scoped.length}
                </Button>

                {/* Destructive, so it is its own control rather than an option
                    in the same dropdown as "set stock to". */}
                {scoped.length > 0 && scoped.length < variants.length && (
                  <button
                    type="button"
                    onClick={() => removeVariants(scoped.map((v) => v.id))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xs border border-line px-3 text-[13px] text-faint transition-colors hover:border-sale hover:text-sale"
                  >
                    <Icon name="trash" size={14} />
                    Remove {scoped.length}
                  </button>
                )}
              </div>
              <p className="text-[12px] text-faint">
                Prices are in major units here — <span className="text-muted">3.00</span> on
                &ldquo;adjust price by&rdquo; adds three to every row in scope, which is how a surcharge
                for a bigger size or weight is normally expressed.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xs border border-line">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-sunken/40 text-left">
                    <th className="w-8 p-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all variants"
                        checked={allPicked}
                        onChange={(e) => setPicked(e.target.checked ? variants.map((v) => v.id) : [])}
                        className="h-4 w-4 accent-[rgb(var(--accent))]"
                      />
                    </th>
                    <th className="p-2.5 font-medium">Variant</th>
                    <th className="p-2.5 font-medium">SKU</th>
                    <th className="p-2.5 font-medium">Stock</th>
                    <th className="p-2.5 font-medium">Price</th>
                    <th className="p-2.5 font-medium">Image</th>
                    <th className="w-10 p-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const shade = colour ? v.options?.[colour.name] : null
                    return (
                    <tr key={v.id} className={`border-b border-line last:border-0 ${picked.includes(v.id) ? 'bg-accent-soft/30' : ''}`}>
                      <td className="p-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${label(v)}`}
                          checked={picked.includes(v.id)}
                          onChange={() =>
                            setPicked((sel) => (sel.includes(v.id) ? sel.filter((x) => x !== v.id) : [...sel, v.id]))
                          }
                          className="h-4 w-4 accent-[rgb(var(--accent))]"
                        />
                      </td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          {/* A dot only where there is a colour to show. */}
                          {colour && (
                            <span
                              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-ink/15"
                              style={{ background: draft.swatches?.[shade] || '#ddd' }}
                            />
                          )}
                          {label(v)}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <input className="field h-8 font-mono text-[12px]" value={v.sku}
                          aria-label={`SKU for ${label(v)}`}
                          onChange={(e) => patchVariant(v.id, 'sku', e.target.value)} />
                      </td>
                      <td className="p-2.5">
                        <input type="number" min="0" className="field h-8 w-20 tabular-nums" value={v.inventory}
                          aria-label={`Stock for ${label(v)}`}
                          onChange={(e) => patchVariant(v.id, 'inventory', Math.max(0, Number(e.target.value)))} />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`Price for ${label(v)}`}
                          className={`field h-8 w-28 tabular-nums ${v.price?.amount !== draft.price?.amount ? 'border-accent' : ''}`}
                          value={toMajor(v.price || draft.price)}
                          onChange={(e) =>
                            patchVariant(v.id, 'price', {
                              amount: toMinor(Number(e.target.value) || 0),
                              currency: draft.price.currency,
                            })
                          }
                        />
                      </td>
                      <td className="p-2.5">
                        <VariantImagePicker
                          variant={v}
                          label={label(v)}
                          images={images}
                          onPick={(id) => patchVariant(v.id, 'imageId', id)}
                          onUpload={async (file) => {
                            const m = await api.uploadMedia(file)
                            const img = {
                              id: m.id,
                              url: m.url,
                              type: m.type,
                              alt: shade ? `${draft.title} in ${shade}` : draft.title,
                              color: shade || undefined,
                              width: m.width,
                              height: m.height,
                            }
                            // Added to the product's media and pointed at from
                            // this row in one action — uploading, scrolling up
                            // to tag it, then coming back is three steps for
                            // one intention.
                            set('images', [...images, img])
                            patchVariant(v.id, 'imageId', m.id)
                          }}
                        />
                      </td>
                      <td className="p-2.5">
                        <button
                          type="button"
                          onClick={() => removeVariants([v.id])}
                          aria-label={`Remove ${label(v)}`}
                          title={`Remove ${label(v)}`}
                          className="grid h-8 w-8 place-items-center rounded-xs text-faint transition-colors hover:bg-sale/10 hover:text-sale"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-faint">
              A price shown with an amber border differs from the product price and will not be
              overwritten when you change it.
            </p>
          </>
        )}
      </Panel>
    </div>
  )
}

const isColourName = (option, known) => colourOptionOf([option], known) != null

/**
 * One option: its name, its place in the order, and its values.
 *
 * The name is committed when the field is left, not on every keystroke: the
 * variants store their values under it, and renaming them through "S", "Si",
 * "Siz" would briefly collide with anything else called that.
 */
function OptionCard({ option, index, count, colour, swatches, known, apparel, onRename, onValues, onMove, onRemove }) {
  const [name, setName] = useState(option.name)
  const commit = () => {
    if (!onRename(option.name, name)) setName(option.name)
  }
  const fallback = apparel && /^sizes?$/i.test(option.name) ? SIZE_SUGGESTIONS : []
  const suggestions = valueSuggestions(known, option.name, option.values || [], fallback)
  const fieldId = `option-name-${index}`

  return (
    <li className="rounded-xs border border-line p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor={fieldId} className="mb-1.5 block text-[12px] font-medium">Option name</label>
          <input
            id={fieldId}
            list="option-names"
            className="field h-9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />
        </div>
        <span className="pb-2.5 text-[11px] text-faint">
          {colour ? 'Swatches' : `${option.values?.length || 0} value${option.values?.length === 1 ? '' : 's'}`}
        </span>
        {index > 0 && <IconBtn label={`Move ${option.name} up`} icon="chevron-left" rotate onClick={() => onMove(index, index - 1)} />}
        {index < count - 1 && <IconBtn label={`Move ${option.name} down`} icon="chevron-right" rotate onClick={() => onMove(index, index + 1)} />}
        <IconBtn label={`Remove ${option.name}`} icon="trash" tone="sale" onClick={() => onRemove(option.name)} />
      </div>

      <div className="mt-3">
        {colour ? (
          <SwatchEditor
            values={option.values || []}
            swatches={swatches}
            known={knownSwatches(known, option.name)}
            suggestions={suggestions}
            onChange={(values, next) => onValues(option.name, values, next)}
          />
        ) : (
          <TokenEditor
            values={option.values || []}
            onChange={(values) => onValues(option.name, values)}
            suggestions={suggestions}
          />
        )}
      </div>
    </li>
  )
}

/** Add an option by name, with the names this store already uses one click away. */
function AddOption({ suggestions, onAdd, empty }) {
  const [name, setName] = useState('')
  const add = (value) => {
    if (onAdd(value)) setName('')
  }
  return (
    <div>
      {empty && (
        <p className="mb-2.5 text-[13px] text-faint">No options. Add one, or leave it and sell the product as it is.</p>
      )}
      <div className="flex gap-2">
        <input
          list="option-names"
          aria-label="New option name"
          className="field h-9"
          value={name}
          placeholder="Option name, e.g. Weight"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(name)
            }
          }}
        />
        <Button size="sm" variant="quiet" icon="plus" onClick={() => add(name)}>Add option</Button>
      </div>
      {suggestions.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 8).map((s) => (
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

/**
 * The image for one variant.
 *
 * A dropdown of "1, 2, 3" is unusable once a product has eight shots — nobody
 * remembers which number is the charcoal one. This shows the actual thumbnail,
 * opens a grid of the product's media, and can upload straight into the row so
 * a colourway that arrives late does not mean scrolling back up to the Media
 * tab and tagging it by hand.
 */
function VariantImagePicker({ variant, label, images, onPick, onUpload }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const current = images.find((img) => img.id === variant.imageId)

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      await onUpload(file)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Image for ${label}`}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xs border border-line transition-colors hover:border-ink"
      >
        {current ? (
          <Media src={current.url} type={current.type} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name="plus" size={14} className="text-faint" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} role="presentation" />
          <div className="absolute right-0 z-30 mt-1 w-64 rounded-xs border border-line bg-surface p-3 shadow-card">
            <p className="text-[11px] uppercase tracking-[0.14em] text-faint">
              {label}
            </p>
            {images.length > 0 && (
              <ul className="mt-2.5 grid grid-cols-4 gap-1.5">
                {images.map((img) => (
                  <li key={img.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(img.id)
                        setOpen(false)
                      }}
                      aria-label={img.alt || 'Use this shot'}
                      className={`block w-full overflow-hidden rounded-xs border transition-colors ${
                        img.id === variant.imageId ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-ink'
                      }`}
                    >
                      <span className="shot block">
                        <Media src={img.url} type={img.type} alt="" className="h-full w-full object-cover" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-[12px] text-accent link-underline disabled:opacity-50"
              >
                <Icon name="plus" size={12} />
                {busy ? 'Uploading…' : 'Upload for this variant'}
              </button>
              {variant.imageId && (
                <button
                  type="button"
                  onClick={() => {
                    onPick(null)
                    setOpen(false)
                  }}
                  className="ml-auto text-[12px] text-faint link-underline hover:text-sale"
                >
                  Clear
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  upload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── fit and fabric ────────────────────────────────────────────────────── */

function FitTab({ draft, set, charts, type }) {
  const { blocks, labels } = type
  // The clothing wording (drape, see-through, garment measurements) only where the product is worn.
  const worn = blocks.fit
  const fit = draft.fit || {}
  const fabric = draft.fabric || {}
  const fb = fit.feedback || { small: 0, true: 100, large: 0 }
  const unit = labels.weightUnit

  return (
    <div className="space-y-8">
      {blocks.fit && (
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

        {!isMock ? (
          // Worked out from reviews by the backend. An editable copy here was
          // accepted, ignored on save, and back to the real figures on reload.
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Purchaser feedback</p>
            <p className="text-[13px] text-muted">
              {fit.sample
                ? `${fb.small}% runs small · ${fb.true}% true to size · ${fb.large}% runs large, from ${fit.sample} review${fit.sample === 1 ? '' : 's'}.`
                : 'No fit feedback yet.'}
            </p>
            <p className="mt-1 text-[12px] text-faint">From customer reviews in your back office, so it is read-only here.</p>
          </div>
        ) : (
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
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Model height (cm)" type="number" value={fit.model?.height ?? ''} onChange={(v) => set('fit.model.height', Number(v))} />
          <Text label="Shown as" value={fit.model?.label ?? ''} onChange={(v) => set('fit.model.label', v)} placeholder={`5'11"`} />
          <Text label="Size worn" value={fit.model?.size ?? ''} onChange={(v) => set('fit.model.size', v)} />
        </div>
      </Panel>
      )}

      {blocks.sizeChart && (
      <Panel
        title="Size chart"
        note={
          worn
            ? 'Garment measurements laid flat. A letter size does not transfer between brands; a chest measurement does.'
            : 'Measurements of the product itself, shown beside its size option. A letter or a name does not tell a shopper whether it fits; a measurement does.'
        }
      >
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
      )}

      {blocks.composition && (
      <Panel
        title={labels.composition}
        note={
          worn
            ? 'Weight decides drape, warmth and whether a thing is see-through. 190gsm linen and 110gsm linen are different products.'
            : `What it is made of, as a share of the whole, and where it is made.${unit ? ` Weight is in ${unit}.` : ''}`
        }
      >
        <CompositionEditor
          value={fabric.composition || []}
          onChange={(v) => set('fabric.composition', v)}
          placeholder={worn ? 'Extra-fine merino wool' : labels.composition === 'Ingredients' ? 'e.g. Arabica coffee' : 'e.g. Solid oak'}
          addLabel={worn ? 'Add material' : 'Add a line'}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label={unit ? `Weight (${unit})` : 'Weight'} type="number" step="any" value={fabric.weight ?? ''}
            onChange={(v) => set('fabric.weight', v ? Number(v) : null)} />
          <Text label={worn ? 'Construction' : 'Construction or process'} value={fabric.weave || ''}
            onChange={(v) => set('fabric.weave', v)} placeholder={worn ? 'Oxford' : 'e.g. Hand-finished'} />
          <Text label="Made in" value={fabric.origin || ''} onChange={(v) => set('fabric.origin', v)}
            placeholder={worn ? 'Guimarães, Portugal' : 'City, country'} />
        </div>
        <ListEditor
          label="Certifications"
          items={fabric.certifications || []}
          onChange={(v) => set('fabric.certifications', v)}
          placeholder={worn ? 'OEKO-TEX Standard 100' : 'e.g. FSC, Fairtrade'}
          hint="Third-party marks only. A self-declared claim reads as greenwashing; an audited one is checkable."
        />
      </Panel>
      )}
    </div>
  )
}

/* ── organise ──────────────────────────────────────────────────────────── */

function OrganiseTab({ draft, set, cats, type, catalogue = [] }) {
  // The tags this store uses most, on products of the same type when the list says; clothing words only for clothing.
  const common = frequentTags(catalogue, { typeId: type?.id ?? null })
  const tagSuggestions = common.length ? common : isApparelType(type) ? APPAREL_TAGS : []
  const parentOf = useMemo(() => {
    const map = {}
    cats.forEach((root) => (root.children || []).forEach((c) => { map[c.slug] = root.slug }))
    return map
  }, [cats])

  /**
   * Selecting a sub-category selects its parent too.
   *
   * The catalogue files products against the leaf *and* its ancestors, so a
   * linen shirt tagged only `shirts-linen` would vanish from `/shop/shirts`.
   * Doing it here rather than at read time means what the merchant sees ticked
   * is exactly what is stored.
   *
   * Unticking a parent takes its children with it, because a child without its
   * parent is the same broken state arrived at from the other direction.
   */
  const toggle = (slug) => {
    const current = draft.categories || []
    const parent = parentOf[slug]
    const children = (cats.find((c) => c.slug === slug)?.children || []).map((c) => c.slug)

    if (current.includes(slug)) {
      const drop = new Set([slug, ...children])
      set('categories', current.filter((s) => !drop.has(s)))
    } else {
      set('categories', [...new Set([...current, slug, ...(parent ? [parent] : [])])])
    }
  }

  return (
    <div className="space-y-8">
      <Panel
        title="Categories"
        note="Tick the specific one — its parent is ticked with it, so a product filed under a sub-category also appears under its parent. Unticking a parent releases its children."
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

      <Panel title="Tags" note="Used by filters and recommendations: material, style and use, not adjectives.">
        <TokenEditor values={draft.tags || []} onChange={(v) => set('tags', v)} suggestions={tagSuggestions} />
      </Panel>

      {!isMock && (
        // Counted from orders, wishlists and reviews by the backend. Editable
        // inputs here were accepted, ignored on save, and reset on reload.
        <Panel title="Demand and rating" note="Counted from orders, wishlists and reviews in your back office, so they are read-only here.">
          <p className="text-[13px] text-muted">
            {draft.social?.boughtLast30Days ?? 0} bought in 30 days · saved {draft.social?.savedCount ?? 0} times ·{' '}
            {draft.rating?.count
              ? `rated ${draft.rating.average} from ${draft.rating.count} review${draft.rating.count === 1 ? '' : 's'}`
              : 'no reviews yet'}
          </p>
        </Panel>
      )}

      {isMock && (
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
      )}

      {isMock && (
      <Panel title="Rating" note="Normally written by your review system. Editable here so a migrated catalogue can carry its history.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Average" type="number" step="0.1" min="0" max="5" value={draft.rating?.average ?? 0} onChange={(v) => set('rating.average', Number(v))} />
          <Text label="Review count" type="number" value={draft.rating?.count ?? 0} onChange={(v) => set('rating.count', Number(v))} />
        </div>
        <p className="text-[12px] text-faint">
          A perfect 5.0 converts worse than 4.8 — it reads as filtered.
        </p>
      </Panel>
      )}

      <Panel
        title="You might also like"
        note="The rail at the bottom of the product page. Used only while Storefront settings → recommendations is set to Manual; every other strategy scores this automatically and ignores what is here."
      >
        <RelatedPicker
          slugs={draft.relatedSlugs || []}
          catalogue={catalogue}
          onChange={(next) => set('relatedSlugs', next)}
        />
      </Panel>
    </div>
  )
}

/**
 * The manual recommendation rail.
 *
 * Ordered, because the order is the whole point of choosing manual over a
 * scored strategy — a merchant reaching for this has a specific first item in
 * mind. It is a list with arrows rather than a multi-select for the same
 * reason: a set of ticks cannot express "this one first".
 */
function RelatedPicker({ slugs, catalogue, onChange }) {
  const byslug = useMemo(() => Object.fromEntries(catalogue.map((p) => [p.slug, p])), [catalogue])
  const available = catalogue.filter((p) => !slugs.includes(p.slug))

  const move = (i, j) => {
    if (j < 0 || j >= slugs.length) return
    const next = slugs.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {slugs.length > 0 && (
        <ol className="space-y-2">
          {slugs.map((slug, i) => {
            const p = byslug[slug]
            return (
              <li key={slug} className="flex items-center gap-3 rounded-xs border border-line p-2">
                <span className="w-10 shrink-0">
                  <span className="shot overflow-hidden rounded-xs bg-sunken">
                    {p?.images?.[0] && (
                      <Media src={p.images[0].url} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{p?.title || slug}</span>
                  {/* A slug in the list with no product behind it is a rail
                      item that silently disappears on the storefront. */}
                  {!p && <span className="text-[11px] text-sale">No product with this slug</span>}
                  {p?.published === false && <span className="text-[11px] text-faint">Draft — hidden on the shop</span>}
                </span>
                <TileBtn label="Move up" icon="chevron-left" onClick={() => move(i, i - 1)} />
                <TileBtn label="Move down" icon="chevron-right" onClick={() => move(i, i + 1)} />
                <TileBtn
                  label="Remove"
                  icon="trash"
                  tone="sale"
                  onClick={() => onChange(slugs.filter((s) => s !== slug))}
                />
              </li>
            )
          })}
        </ol>
      )}

      <select
        className="field h-9 py-0 text-[13px]"
        value=""
        onChange={(e) => e.target.value && onChange([...slugs, e.target.value])}
      >
        <option value="">Add a product…</option>
        {available.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.title}
            {p.published === false ? ' (draft)' : ''}
          </option>
        ))}
      </select>

      {!slugs.length && (
        <p className="text-[12px] text-faint">
          Nothing chosen. On Manual, the rail falls back to best-sellers rather than rendering
          empty — an empty rail looks broken and a slightly-off one does not.
        </p>
      )}
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

function Text({ label, hint, mono, error, onChange, ...rest }) {
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {hint && <Hint>{hint}</Hint>}
      </label>
      <input id={id} className={`field ${mono ? 'font-mono text-[13px]' : ''} ${error ? 'border-sale' : ''}`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)} {...rest} />
      {error && <p className="mt-1.5 text-[12px] text-sale">{error}</p>}
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
          {unused.slice(0, 16).map((s) => (
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

function SwatchEditor({ values, swatches, known = {}, suggestions = [], onChange }) {
  const [name, setName] = useState('')
  const [hex, setHex] = useState('#cccccc')

  const add = (value = name, colour = hex) => {
    const t = value.trim()
    if (!t || values.includes(t)) return
    onChange([...values, t], { ...swatches, [t]: colour })
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
          onChange={(e) => {
            setName(e.target.value)
            if (known[e.target.value.trim()]) setHex(known[e.target.value.trim()])
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button size="sm" variant="quiet" onClick={() => add()}>Add</Button>
      </div>
      {suggestions.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 16).map((s) => (
            <li key={s}>
              <button type="button" onClick={() => add(s, known[s] || '#cccccc')}
                className="inline-flex items-center gap-1.5 rounded-xs border border-line px-2 py-1 text-[11px] text-faint hover:border-ink hover:text-ink">
                {known[s] && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-ink/15" style={{ background: known[s] }} />}
                + {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CompositionEditor({ value, onChange, placeholder = 'Material', addLabel = 'Add material' }) {
  const total = value.reduce((a, [, pct]) => a + Number(pct || 0), 0)
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium">Composition</label>
      <ul className="space-y-2">
        {value.map(([material, pct], i) => (
          <li key={i} className="flex gap-2">
            <input className="field" value={material} placeholder={placeholder}
              onChange={(e) => onChange(value.map((row, k) => (k === i ? [e.target.value, row[1]] : row)))} />
            <input type="number" min="0" max="100" className="field w-24 tabular-nums" value={pct}
              onChange={(e) => onChange(value.map((row, k) => (k === i ? [row[0], Number(e.target.value)] : row)))} />
            <IconBtn label="Remove" icon="trash" tone="sale" onClick={() => onChange(value.filter((_, k) => k !== i))} />
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-center gap-3">
        <Button size="sm" variant="quiet" icon="plus" onClick={() => onChange([...value, ['', 0]])}>{addLabel}</Button>
        {/* A running total, not a gate: rows are filled in one at a time, and a
            blank row just added is not a mistake yet. */}
        {value.length > 0 && (
          <span className={`text-[12px] ${total === 100 || total === 0 ? 'text-faint' : 'text-sale'}`}>
            {total}% {total === 100 || total === 0 ? '' : '— should add up to 100'}
          </span>
        )}
      </div>
    </div>
  )
}
