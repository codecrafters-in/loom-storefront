import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import Markdown from '../components/Markdown.jsx'
// Lazily: the reference is prerendered so a crawler reads it without
// JavaScript, and the explorer is only useful to somebody who clicks Run.
const ApiExplorer = lazy(() => import('../components/docs/ApiExplorer.jsx'))
import Seo from '../components/Seo.jsx'
import { Breadcrumbs, Icon, Skeleton } from '../components/ui/index.jsx'
import { docPages, docPath } from '../data/docs.js'
import { config, isMock } from '../lib/config.js'

/**
 * The documentation, inside the product.
 *
 * The docs folder is the single source — this page imports the same markdown
 * files that live in the repository, so nothing is duplicated and nothing can
 * drift.
 *
 * **Public, and prerendered.** It used to live behind the admin login, which
 * put the API reference behind a password on a project whose whole argument is
 * that you can read it before you commit to it. These are also the pages most
 * worth having indexed: somebody searching for how to wire a storefront to
 * their own backend should be able to land on the answer.
 *
 * One URL per document, and only one — the overview is `/docs`, never
 * `/docs/readme`, and the admin links here rather than rendering its own copy.
 * Two URLs for the same words is a duplicate every crawler has to choose
 * between.
 */

/** One line per document, for the meta description and the search result. */
const SUMMARY = {
  readme: 'A free, open-source React storefront that runs on demo data or on your own API.',
  'user-guide': 'Every task the person running the shop has to do, one screen each.',
  api: 'Every endpoint, its request and its response.',
  'data-model': 'Every object shape, and why each field is there.',
  database: 'A PostgreSQL schema for running your own backend.',
  admin: 'The back office and the write API behind it.',
  checkout: 'Payment integration, with Razorpay and Stripe worked through.',
  errors: 'Error codes, and a checklist for when a call fails.',
  testing: 'What the suite covers, and what it deliberately does not.',
  configuration: 'Every setting: menu, home page, currency, policies, features.',
  cro: 'The trust and fit elements, and the research behind each one.',
  performance: 'Prerendering, caching, responsive images and Core Web Vitals.',
  theming: 'Palette, type, logo, brand assets and image ratios.',
  recipes: 'Mapping the contract onto Odoo, Shopify, Medusa and WooCommerce.',
  'integration-prompt': 'A prompt to paste into an AI that builds your backend.',
  'schema-prompt': 'A prompt to paste into an AI that designs your database.',
}

/**
 * Lazily. 290KB of documentation has no business in the bundle a shopper
 * downloads to look at a shirt.
 */
const FILES = import.meta.glob('../../docs/*.md', { query: '?raw', import: 'default' })

/** Used by the prerenderer, which needs the text before it renders. */
export async function loadDoc(slug) {
  const page = docPages.find((p) => p.slug === slug)
  const loader = page && FILES[`../../docs/${page.file}`]
  return loader ? loader() : null
}

/**
 * The markdown for the page being rendered, if it was inlined next to it.
 *
 * Prerendering writes the source into the page it produced. Without that the
 * browser's first render would find an empty glob and paint a skeleton where
 * the server rendered the text — a hydration mismatch that throws away the
 * very words the prerender existed to publish.
 */
const seeded = (slug) => globalThis.__LOOM_DOCS__?.[slug] ?? null

export default function Docs() {
  const { page } = useParams()
  const navigate = useNavigate()
  const active = docPages.find((p) => p.slug === (page || 'readme')) || docPages[0]
  const [source, setSource] = useState(() => seeded(active.slug))
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    const seed = seeded(active.slug)
    setSource(seed)
    setMissing(false)
    if (seed) return undefined
    loadDoc(active.slug).then((text) => {
      if (!alive) return
      if (text === null) setMissing(true)
      else setSource(text)
    })
    return () => {
      alive = false
    }
  }, [active])

  const groups = [...new Set(docPages.map((p) => p.group))]

  return (
    <>
      <Seo
        title={active.slug === 'readme' ? 'Documentation' : active.title}
        description={`${SUMMARY[active.slug] || active.title} — ${config.store?.name || 'LOOM'} storefront documentation.`}
        path={docPath(active.slug)}
      />
      <div className="wrap wrap-tight py-10 pb-24">
        <Breadcrumbs
          trail={[
            { label: 'Home', to: '/' },
            ...(active.slug === 'readme' ? [{ label: 'Docs' }] : [{ label: 'Docs', to: '/docs' }, { label: active.title }]),
          ]}
        />

        <div className="mt-8 flex gap-10">
          <nav aria-label="Documentation" className="hidden w-56 shrink-0 xl:block">
            <div className="sticky top-8 space-y-6">
              {groups.map((g) => (
                <div key={g}>
                  <p className="eyebrow">{g}</p>
                  <ul className="mt-2.5 space-y-0.5">
                    {docPages.filter((p) => p.group === g).map((p) => (
                      <li key={p.slug}>
                        <NavLink
                          end
                          to={docPath(p.slug)}
                          className={({ isActive }) =>
                            `block rounded-xs px-2.5 py-2 text-[13px] transition-colors ${
                              isActive ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'
                            }`
                          }
                        >
                          {p.title}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <a
                href={config.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 text-[12px] text-faint transition-colors hover:text-ink"
              >
                <Icon name="github" size={13} /> Repository
              </a>
            </div>
          </nav>

          <div className="min-w-0 flex-1">
            {/* Narrow screens get a picker rather than a rail. */}
            <div className="mb-6 xl:hidden">
              <label htmlFor="doc" className="sr-only">Choose a document</label>
              <select
                id="doc"
                className="field"
                value={active.slug}
                onChange={(e) => navigate(docPath(e.target.value))}
              >
                {groups.map((g) => (
                  <optgroup key={g} label={g}>
                    {docPages.filter((p) => p.group === g).map((p) => (
                      <option key={p.slug} value={p.slug}>{p.title}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Only on the overview, and only on a demo. A shop with customers
                has no back office link on its public pages, which is why the
                footer hides one — but a demo nobody can get into is a demo
                nobody can judge. */}
            {active.slug === 'readme' && isMock && <DemoPanel />}

            {active.slug === 'api' && (
              <Suspense fallback={<Skeleton className="mb-12 h-64 w-full" />}>
                <ApiExplorer />
              </Suspense>
            )}

            {missing ? (
              <div className="rounded-xs border border-line bg-surface p-6">
                <p className="text-[14px] text-ink">{active.file} is not in this build.</p>
                <p className="mt-2 text-[13px] text-muted">
                  It lives in <code className="font-mono">docs/</code> in the repository.
                </p>
              </div>
            ) : source === null ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <Markdown source={source} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * What this deployment is, and how to get into the back office.
 *
 * The credential is printed rather than hinted at because it protects nothing:
 * the demo's catalogue, orders and settings live in the visitor's own browser,
 * so signing in edits a copy that belongs to them and nobody else. Anything
 * they change is one "Reset demo data" away, and no other visitor ever sees it.
 */
function DemoPanel() {
  return (
    <section className="mb-10 rounded-xs border border-accent/30 bg-accent-soft/40 p-5">
      <p className="eyebrow">You are looking at a live demo</p>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink">
        Every product, order and setting here is served by the bundled catalogue and stored in this
        browser. Nothing is shared between visitors, so you can change anything.
      </p>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="eyebrow">Back office</dt>
          <dd className="mt-1.5 text-[14px] text-ink">
            <Link to="/admin" className="link-underline">/admin</Link> — sign in with{' '}
            <code className="rounded-xs bg-surface px-1.5 py-0.5 font-mono text-[13px]">{config.adminUser}</code>
            {' / '}
            <code className="rounded-xs bg-surface px-1.5 py-0.5 font-mono text-[13px]">{config.adminPassword}</code>
          </dd>
        </div>
        <div>
          <dt className="eyebrow">The contract, live</dt>
          <dd className="mt-1.5 text-[14px] text-ink">
            <Link to="/docs/api" className="link-underline">Run every read endpoint</Link> and see exactly
            what your own backend has to return.
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-[13px] leading-relaxed text-muted">
        Point it at a real API by setting two environment variables — the whole data layer swaps and
        no component changes. That is what{' '}
        <Link to="/docs/integration-prompt" className="link-underline">the backend prompt</Link> is for.
      </p>
    </section>
  )
}
