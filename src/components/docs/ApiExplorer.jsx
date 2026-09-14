import { useState } from 'react'
import { Button, Icon } from '../ui/index.jsx'
import api, { isMock } from '../../lib/api/index.js'
import { config } from '../../lib/config.js'

/**
 * Every read endpoint, runnable from the page that documents it.
 *
 * Documentation that only *describes* a response is documentation you have to
 * trust. This runs the same adapter the storefront itself is running — in demo
 * mode that is the bundled catalogue, in `api` mode it is a real request to a
 * real server — so the JSON below is not an example of the contract, it is the
 * contract answering.
 *
 * Read-only, and that is a decision rather than an omission. `POST /carts/:id/
 * lines` from a documentation page would put a shirt in the reader's bag, and
 * `POST /admin/*` would edit the shop they are evaluating. Anything that
 * changes state is documented and not wired up.
 *
 * Lazily loaded, because the page around it is prerendered for crawlers and
 * this is only useful to somebody who clicks.
 */

/** Left out on purpose: everything with a side effect. */
const ENDPOINTS = [
  {
    id: 'bootstrap',
    verb: 'GET',
    path: '/bootstrap',
    group: 'Catalogue',
    note: 'One call the app makes on first paint: settings, categories, collections and the featured rows, so the first screen needs nothing else.',
    run: () => api.getBootstrap(),
  },
  {
    id: 'storefront',
    verb: 'GET',
    path: '/storefront',
    group: 'Catalogue',
    note: 'Theme configuration — menu, home page, policies, currency. Served to every visitor, which is why no secret may ever be stored in it.',
    run: () => api.getStorefront(),
  },
  {
    id: 'products',
    verb: 'GET',
    path: '/products',
    group: 'Catalogue',
    note: 'The listing. Filters compose; an unknown filter must narrow to nothing rather than be ignored.',
    fields: [
      { name: 'q', label: 'Search', placeholder: 'shirt' },
      { name: 'category', label: 'Category slug', placeholder: 'shirts' },
      { name: 'sort', label: 'Sort', placeholder: 'newest | price-asc | price-desc' },
      { name: 'perPage', label: 'Per page', value: '3' },
    ],
    run: (a) => api.listProducts({ ...a, perPage: Number(a.perPage) || 3 }),
  },
  {
    id: 'product',
    verb: 'GET',
    path: '/products/:slug',
    group: 'Catalogue',
    note: 'One product, with every variant, image and enrichment block the product page renders.',
    fields: [{ name: 'slug', label: 'Slug', value: 'oxford-shirt-ecru' }],
    run: (a) => api.getProduct(a.slug),
  },
  {
    id: 'related',
    verb: 'GET',
    path: '/products/:slug/related',
    group: 'Catalogue',
    note: 'Recommendations. `strategy: manual` honours the product’s own list; `automatic` derives them.',
    fields: [
      { name: 'slug', label: 'Slug', value: 'oxford-shirt-ecru' },
      { name: 'limit', label: 'Limit', value: '2' },
    ],
    run: (a) => api.getRelated(a.slug, { limit: Number(a.limit) || 2 }),
  },
  {
    id: 'reviews',
    verb: 'GET',
    path: '/products/:slug/reviews',
    group: 'Catalogue',
    note: '`summary` drives the whole ratings panel and is required — a backend that omits it fails at the adapter, by name, rather than three components later.',
    fields: [
      { name: 'slug', label: 'Slug', value: 'oxford-shirt-ecru' },
      { name: 'perPage', label: 'Per page', value: '2' },
    ],
    run: (a) => api.getReviews(a.slug, { perPage: Number(a.perPage) || 2 }),
  },
  {
    id: 'categories',
    verb: 'GET',
    path: '/categories',
    group: 'Catalogue',
    note: 'Nested, parents carrying their children. The header menu and every breadcrumb read this.',
    run: () => api.listCategories(),
  },
  {
    id: 'collections',
    verb: 'GET',
    path: '/collections',
    group: 'Catalogue',
    note: 'Merchandised groups with their own title, blurb and image — the campaign primitive.',
    run: () => api.listCollections(),
  },
  {
    id: 'size-charts',
    verb: 'GET',
    path: '/size-charts',
    group: 'Fit',
    note: 'Measurement tables, referenced by a product rather than copied into it.',
    run: () => api.listSizeCharts(),
  },
  {
    id: 'attributes',
    verb: 'GET',
    path: '/attributes',
    group: 'Fit',
    note: 'The vocabulary in use across the catalogue: sizes, colours, tags. What the filter rail is built from.',
    run: () => api.listAttributes(),
  },
  {
    id: 'cart',
    verb: 'GET',
    path: '/carts/:id',
    group: 'Session',
    note: 'The reader’s own bag, priced. Empty until something is added — this call creates nothing.',
    run: () => api.getCart(),
  },
]

const GROUPS = [...new Set(ENDPOINTS.map((e) => e.group))]

/** Initial values, so a reader can press Run without filling anything in. */
const defaults = (endpoint) =>
  Object.fromEntries((endpoint.fields || []).map((f) => [f.name, f.value ?? '']))

/** What the same call looks like against a real backend. */
function curl(endpoint, args) {
  const base = config.api.baseUrl || 'https://api.yourshop.com/v1'
  let path = endpoint.path.replace(/:(\w+)/g, (_, k) => encodeURIComponent(args[k] ?? `:${k}`))
  if (endpoint.id === 'cart') path = '/carts/:id'

  const query = (endpoint.fields || [])
    .filter((f) => !endpoint.path.includes(`:${f.name}`) && args[f.name])
    .map((f) => `${f.name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}=${encodeURIComponent(args[f.name])}`)
    .join('&')

  return `curl ${base}${path}${query ? `?${query}` : ''}`
}

export default function ApiExplorer() {
  const [id, setId] = useState(ENDPOINTS[0].id)
  const endpoint = ENDPOINTS.find((e) => e.id === id) || ENDPOINTS[0]
  const [args, setArgs] = useState(() => defaults(ENDPOINTS[0]))
  const [state, setState] = useState({ status: 'idle' })

  const select = (next) => {
    setId(next)
    setArgs(defaults(ENDPOINTS.find((e) => e.id === next)))
    setState({ status: 'idle' })
  }

  const run = async () => {
    setState({ status: 'running' })
    const started = performance.now()
    try {
      const data = await endpoint.run(args)
      setState({ status: 'ok', data, ms: Math.round(performance.now() - started) })
    } catch (err) {
      // The adapter throws ApiError and ContractError with a status and a code;
      // showing them is the point, since debugging a backend against this is
      // most of what the page is for.
      setState({
        status: 'error',
        ms: Math.round(performance.now() - started),
        data: { error: err.name, message: err.message, status: err.status, code: err.code },
      })
    }
  }

  return (
    <section className="mb-12 overflow-hidden rounded-xs border border-line bg-surface" aria-label="API explorer">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/60 px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-medium text-ink">Try it</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {isMock
              ? 'Running against the bundled catalogue in your browser. No request leaves this page — the response below is what your backend has to return.'
              : `Running against ${config.api.baseUrl}. These are real requests.`}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          {isMock ? 'demo data' : 'live api'}
        </span>
      </header>

      <div className="grid gap-0 md:grid-cols-[15rem_1fr]">
        <nav className="border-b border-line md:border-b-0 md:border-r" aria-label="Endpoints">
          <ul className="max-h-[22rem] overflow-y-auto py-2">
            {GROUPS.map((g) => (
              <li key={g}>
                <p className="eyebrow px-5 pb-1 pt-3">{g}</p>
                <ul>
                  {ENDPOINTS.filter((e) => e.group === g).map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => select(e.id)}
                        aria-current={e.id === id}
                        className={`flex w-full items-baseline gap-2 px-5 py-1.5 text-left font-mono text-[12px] transition-colors ${
                          e.id === id ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'
                        }`}
                      >
                        <span className="text-[10px] text-accent">{e.verb}</span>
                        <span className="min-w-0 break-all">{e.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 p-5">
          <p className="text-[13px] leading-relaxed text-muted">{endpoint.note}</p>

          {endpoint.fields?.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {endpoint.fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="eyebrow">{f.label}</span>
                  <input
                    className="field mt-1.5"
                    value={args[f.name] ?? ''}
                    placeholder={f.placeholder || ''}
                    onChange={(e) => setArgs((prev) => ({ ...prev, [f.name]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button as="button" type="button" onClick={run} disabled={state.status === 'running'}>
              {state.status === 'running' ? 'Running…' : 'Run'}
            </Button>
            {state.ms !== undefined && (
              <span className="font-mono text-[11px] text-faint">
                {state.status === 'error' ? 'failed' : 'ok'} · {state.ms}ms
              </span>
            )}
          </div>

          <p className="eyebrow mt-6">Against your own backend</p>
          <pre className="mt-2 overflow-x-auto rounded-xs bg-sunken p-3 font-mono text-[11.5px] leading-relaxed text-muted">
            {curl(endpoint, args)}
          </pre>

          {state.status !== 'idle' && state.status !== 'running' && (
            <>
              <p className="eyebrow mt-6 flex items-center gap-1.5">
                {state.status === 'error' && <Icon name="info" size={12} />}
                Response
              </p>
              <pre
                className={`mt-2 max-h-96 overflow-auto rounded-xs p-3 font-mono text-[11.5px] leading-relaxed ${
                  state.status === 'error' ? 'bg-sunken text-sale' : 'bg-sunken text-ink'
                }`}
              >
                {format(state.data)}
              </pre>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * A catalogue response is tens of thousands of characters and a browser will
 * lay out every one of them. Truncating with the length stated beats a page
 * that freezes on Run.
 */
function format(data) {
  const text = JSON.stringify(data, null, 2)
  const LIMIT = 20000
  return text.length > LIMIT
    ? `${text.slice(0, LIMIT)}\n\n… ${(text.length - LIMIT).toLocaleString()} more characters. Narrow it with the fields above.`
    : text
}
