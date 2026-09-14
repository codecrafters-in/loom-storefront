import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import api, { peek } from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import Promises from '../components/layout/Promises.jsx'
import { Breadcrumbs, ErrorState, Skeleton } from '../components/ui/index.jsx'
import Seo from '../components/Seo.jsx'
import ContactDetails from '../components/content/ContactDetails.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { t } from '../i18n/index.js'

const ContactForm = lazy(() => import('../components/content/ContactForm.jsx'))

/**
 * An information page written in the backend (`GET /pages/:slug`): shipping,
 * returns, terms, privacy, FAQ, contact. Blocks are text, tables, images,
 * questions and answers, the store's contact details and a contact form.
 */
const paragraphs = (text) => (text || '').split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)

/** Consecutive question-and-answer blocks read as one list. */
function grouped(blocks = []) {
  const out = []
  for (const block of blocks) {
    const last = out[out.length - 1]
    if (block.type === 'faq' && last?.type === 'faq-group') last.items.push(block)
    else if (block.type === 'faq') out.push({ type: 'faq-group', items: [block] })
    else out.push(block)
  }
  return out
}

function Text({ block }) {
  return (
    <>
      {paragraphs(block.p).map((text) => (
        <p key={text} className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-muted">{text}</p>
      ))}
      {block.html && <div className="rich mt-4 text-[15px] leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: block.html }} />}
    </>
  )
}

function Table({ rows }) {
  if (!rows?.length) return null
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line text-start">
            {rows[0].map((h, i) => <th key={i} className="py-2.5 pe-4 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, r) => (
            <tr key={r} className="border-b border-line">
              {row.map((cell, i) => (
                <td key={i} className={`py-2.5 pe-4 tabular-nums ${i === 0 ? 'text-ink' : 'text-muted'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Block({ block, config }) {
  if (block.type === 'faq-group') {
    return (
      <section className="divide-y divide-line border-y border-line">
        {block.items.map((item, i) => (
          <details key={i} className="py-4">
            <summary className="cursor-pointer text-[16px] font-medium">{item.h}</summary>
            <Text block={item} />
          </details>
        ))}
      </section>
    )
  }
  return (
    <section>
      {block.h && <h2 className="text-display-md">{block.h}</h2>}
      {block.type === 'image' && block.image?.url && (
        <figure className="mt-5">
          <img src={block.image.url} alt={block.image.alt || ''} loading="lazy" className="w-full rounded-xs" />
        </figure>
      )}
      {block.type !== 'contact-form' && <Text block={block} />}
      {block.table && <Table rows={block.table} />}
      {block.type === 'contact' && <ContactDetails contact={config.store?.contact} />}
      {block.type === 'contact-form' && config.features?.contactForm !== false && (
        <Suspense fallback={<Skeleton className="mt-5 h-72 w-full" />}>
          <ContactForm />
        </Suspense>
      )}
    </section>
  )
}

export default function StaticPage() {
  const { slug } = useParams()
  const config = useStorefront()
  // Seeded by the prerenderer, so the page is in the HTML rather than a skeleton.
  const { data: page, error, loading, reload } = useAsync(() => api.getPage(slug), [slug], { initial: peek.getPage(slug) })

  if (error?.status === 404) return <Navigate to="/404" replace />
  if (error) {
    return (
      <div className="wrap max-w-3xl py-20">
        <ErrorState error={error} onRetry={reload} />
      </div>
    )
  }
  if (loading || !page) {
    return (
      <div className="wrap max-w-3xl py-10 pb-20">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-5 w-full" />
        <Skeleton className="mt-12 h-48 w-full" />
      </div>
    )
  }

  return (
    <>
      <Seo seo={page.seo} title={page.title} description={page.intro} />
      <div className="wrap max-w-3xl py-10 pb-20">
        <Breadcrumbs trail={[{ label: t('Home'), to: '/' }, { label: page.title }]} />
        <h1 className="mt-6 text-display-lg">{page.title}</h1>
        {page.intro && <p className="mt-5 text-[17px] leading-relaxed text-muted">{page.intro}</p>}
        <div className="mt-12 space-y-12">
          {grouped(page.blocks).map((block, i) => <Block key={i} block={block} config={config} />)}
        </div>
      </div>
      <Promises />
    </>
  )
}
