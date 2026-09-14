import { Link, useSearchParams } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import Seo from '../components/Seo.jsx'
import { Empty, ErrorState, Pagination, Skeleton } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'
import { useStorefront } from '../store/StorefrontContext.jsx'

/** The store's blog, from the backend's blog app (`GET /blog`). */
export default function Blog() {
  const config = useStorefront()
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page')) || 1
  const tag = params.get('tag') || undefined
  const { data, error, loading, reload } = useAsync(() => api.listBlogPosts({ page, perPage: 12, tag }), [page, tag])
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString(config.pricing?.locale || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
  const go = (next) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p)
  }

  return (
    <>
      <Seo title={t('Blog')} />
      <div className="wrap py-10 pb-20">
        <h1 className="text-display-lg">{t('Blog')}</h1>
        {data?.tags?.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2" aria-label={t('Topics')}>
            {[undefined, ...data.tags].map((topic) => (
              <button
                key={topic || 'all'}
                type="button"
                aria-pressed={tag === topic}
                onClick={() => go({ tag: topic, page: undefined })}
                className={`rounded-full border px-3 py-1 text-[13px] ${tag === topic ? 'border-ink bg-ink text-page' : 'border-line text-muted hover:border-ink'}`}
              >
                {topic || t('All')}
              </button>
            ))}
          </div>
        )}
        <div className="mt-10">
          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : loading ? (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72 w-full" />)}
            </div>
          ) : !data?.items.length ? (
            <Empty icon="info" title={t('No posts yet')} body={t('New posts will appear here.')} />
          ) : (
            <>
              <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((post) => (
                  <li key={post.id}>
                    <Link to={`/blog/${post.slug}`} className="group block">
                      <div className="aspect-[4/3] overflow-hidden rounded-xs bg-sunken">
                        {post.image && <img src={post.image.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
                      </div>
                      <p className="mt-4 text-[12px] text-faint">{date(post.publishedAt)}</p>
                      <h2 className="mt-1 font-display text-xl group-hover:text-accent">{post.title}</h2>
                      {(post.subtitle || post.teaser) && <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-muted">{post.subtitle || post.teaser}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-12">
                <Pagination page={data.page} perPage={data.perPage} total={data.total} onPage={(p) => go({ page: p > 1 ? String(p) : undefined })} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
