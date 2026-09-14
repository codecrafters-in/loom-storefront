import { Navigate, useParams } from 'react-router-dom'
import api from '../lib/api/index.js'
import useAsync from '../hooks/useAsync.js'
import Seo from '../components/Seo.jsx'
import { Breadcrumbs, ErrorState, Skeleton } from '../components/ui/index.jsx'
import { t } from '../i18n/index.js'
import { useStorefront } from '../store/StorefrontContext.jsx'

/** One blog post (`GET /blog/:slug`). The content is HTML the backend has already sanitised. */
export default function BlogPost() {
  const { slug } = useParams()
  const config = useStorefront()
  const { data: post, error, loading, reload } = useAsync(() => api.getBlogPost(slug), [slug])

  if (error?.status === 404) return <Navigate to="/404" replace />
  if (error) return <div className="wrap max-w-3xl py-20"><ErrorState error={error} onRetry={reload} /></div>
  if (loading || !post) {
    return (
      <div className="wrap max-w-3xl py-10">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="mt-8 h-80 w-full" />
      </div>
    )
  }

  const published = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString(config.pricing?.locale || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <>
      <Seo title={post.seo?.title || post.title} description={post.seo?.description || post.teaser} image={post.image?.url} type="article" />
      <article className="wrap max-w-3xl py-10 pb-20">
        <Breadcrumbs trail={[{ label: t('Blog'), to: '/blog' }, { label: post.title }]} />
        <h1 className="mt-6 text-display-lg">{post.title}</h1>
        {post.subtitle && <p className="mt-4 text-[18px] leading-relaxed text-muted">{post.subtitle}</p>}
        <p className="mt-4 text-[13px] text-faint">{[post.author, published].filter(Boolean).join(' · ')}</p>
        {post.image && <img src={post.image.url} alt="" className="mt-8 w-full rounded-xs" />}
        <div className="rich mt-10 text-[16px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
        {post.tags?.length > 0 && (
          <p className="mt-10 text-[13px] text-muted">{t('Topics: {tags}', { tags: post.tags.join(', ') })}</p>
        )}
      </article>
    </>
  )
}
