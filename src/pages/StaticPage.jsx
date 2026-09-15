import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import api, { peek } from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import Promises from '../components/layout/Promises.jsx'
import { Breadcrumbs, ErrorState, Skeleton } from '../components/ui/index.jsx'
import Media from '../components/ui/Media.jsx'
import Seo from '../components/Seo.jsx'
import ContactDetails from '../components/content/ContactDetails.jsx'
import { useStorefront } from '../store/StorefrontContext.jsx'
import { blockParts, groupBlocks, paragraphs } from '../lib/page-blocks.js'
import { t } from '../i18n/index.js'

const ContactForm = lazy(() => import('../components/content/ContactForm.jsx'))

/**
 * An information page written in the backend (`GET /pages/:slug`): shipping,
 * returns, terms, privacy, FAQ, contact. Blocks are text, tables, images,
 * questions and answers, the store's contact details and a contact form.
 * Which parts a block shows is decided in lib/page-blocks.js.
 */

/** The page's text column is 48rem at most. */
const IMAGE_SIZES = '(min-width: 768px) 48rem, 100vw'

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

/** A block's parts below its heading, in the order `blockParts` gives them. */
function Parts({ block, parts, config }) {
  return parts.map((part) => {
    if (part === 'image') {
      return (
        <figure key="image" className="mt-5">
          {/* Like a product photograph: the sizes the backend keeps (`image.srcset`), through the store's image CDN. */}
          <Media
            src={block.image.url}
            srcset={block.image.srcset}
            sizes={IMAGE_SIZES}
            alt={block.image.alt || ''}
            loading="lazy"
            className="w-full rounded-xs"
          />
        </figure>
      )
    }
    if (part === 'text') return <Text key="text" block={block} />
    if (part === 'table') return <Table key="table" rows={block.table} />
    if (part === 'contact') return <ContactDetails key="contact" contact={config.store?.contact} />
    if (part === 'form') {
      return (
        <Suspense key="form" fallback={<Skeleton className="mt-5 h-72 w-full" />}>
          <ContactForm />
        </Suspense>
      )
    }
    return null
  })
}

const belowHeading = (parts) => parts.filter((part) => part !== 'heading')

function Block({ block, config }) {
  if (block.type === 'faq-group') {
    return (
      <section className="divide-y divide-line border-y border-line">
        {block.items.map((item, i) => (
          <details key={i} className="py-4">
            <summary className="cursor-pointer text-[16px] font-medium">{item.h}</summary>
            {/* The answer keeps its own image and table. */}
            <Parts block={item} parts={belowHeading(blockParts(item, config.features))} config={config} />
          </details>
        ))}
      </section>
    )
  }
  const parts = blockParts(block, config.features)
  if (!parts.length) return null
  return (
    <section>
      {parts.includes('heading') && <h2 className="text-display-md">{block.h}</h2>}
      <Parts block={block} parts={belowHeading(parts)} config={config} />
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
          {groupBlocks(page.blocks).map((block, i) => <Block key={i} block={block} config={config} />)}
        </div>
      </div>
      <Promises />
    </>
  )
}
