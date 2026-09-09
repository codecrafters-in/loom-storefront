import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import Markdown from '../../components/admin/Markdown.jsx'
import { Icon, Skeleton } from '../../components/ui/index.jsx'
import { config } from '../../lib/config.js'

/**
 * The documentation, inside the product.
 *
 * The docs folder is the single source — these pages import the same markdown
 * files that live in the repository, loaded lazily so opening the back office
 * does not download every word of them. Nothing is duplicated, so nothing can
 * drift.
 *
 * It is here rather than only on GitHub because the person who needs the API
 * contract is usually already looking at the catalogue it describes, and
 * because the AI prompts are meant to be copied, which is a click here and a
 * navigation somewhere else.
 */
const PAGES = [
  { slug: 'readme', file: 'README.md', title: 'Overview', group: 'Start' },
  { slug: 'user-guide', file: 'USER-GUIDE.md', title: 'Running the shop', group: 'Start' },

  { slug: 'api', file: 'API.md', title: 'API reference', group: 'Build' },
  { slug: 'data-model', file: 'DATA-MODEL.md', title: 'Data model', group: 'Build' },
  { slug: 'database', file: 'DATABASE.md', title: 'Database schema', group: 'Build' },
  { slug: 'admin', file: 'ADMIN.md', title: 'Write API', group: 'Build' },
  { slug: 'checkout', file: 'CHECKOUT.md', title: 'Checkout & payments', group: 'Build' },
  { slug: 'errors', file: 'ERRORS.md', title: 'Errors', group: 'Build' },
  { slug: 'testing', file: 'TESTING.md', title: 'Testing', group: 'Build' },

  { slug: 'integration-prompt', file: 'INTEGRATION-PROMPT.md', title: 'Backend prompt', group: 'AI prompts' },
  { slug: 'schema-prompt', file: 'SCHEMA-PROMPT.md', title: 'Database prompt', group: 'AI prompts' },

  { slug: 'configuration', file: 'CONFIGURATION.md', title: 'Configuration', group: 'Operate' },
  { slug: 'performance', file: 'PERFORMANCE.md', title: 'Performance & scale', group: 'Operate' },
  { slug: 'cro', file: 'CRO.md', title: 'Trust & conversion', group: 'Operate' },
  { slug: 'theming', file: 'THEMING.md', title: 'Theming', group: 'Operate' },
  { slug: 'recipes', file: 'RECIPES.md', title: 'Odoo, Shopify, others', group: 'Operate' },
]

// Lazily, so the back office does not carry every word of the documentation.
const FILES = import.meta.glob('../../../docs/*.md', { query: '?raw', import: 'default' })

export default function Docs() {
  const { page } = useParams()
  const active = PAGES.find((p) => p.slug === (page || 'readme')) || PAGES[0]
  const [source, setSource] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    setSource(null)
    setMissing(false)
    const loader = FILES[`../../../docs/${active.file}`]
    if (!loader) {
      setMissing(true)
      return undefined
    }
    loader().then((text) => alive && setSource(text))
    return () => {
      alive = false
    }
  }, [active])

  const groups = [...new Set(PAGES.map((p) => p.group))]

  return (
    <div className="flex gap-10">
      <nav aria-label="Documentation" className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-8 space-y-6">
          {groups.map((g) => (
            <div key={g}>
              <p className="eyebrow">{g}</p>
              <ul className="mt-2.5 space-y-0.5">
                {PAGES.filter((p) => p.group === g).map((p) => (
                  <li key={p.slug}>
                    <NavLink
                      to={`/admin/docs/${p.slug}`}
                      className={({ isActive }) =>
                        `block rounded-xs px-2.5 py-2 text-[13px] transition-colors ${
                          isActive || (p.slug === 'readme' && !page)
                            ? 'bg-sunken text-ink'
                            : 'text-muted hover:text-ink'
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
            onChange={(e) => {
              window.location.href = `/admin/docs/${e.target.value}`
            }}
          >
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {PAGES.filter((p) => p.group === g).map((p) => (
                  <option key={p.slug} value={p.slug}>{p.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

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
  )
}
