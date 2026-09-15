import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Button, Empty, ErrorState, Pagination, Rating, Skeleton } from '../../components/ui/index.jsx'
import { useToast } from '../../store/ToastContext.jsx'
import { formatMoney } from '../../lib/money.js'

/*
 * What shoppers sent that waits for someone: returns to approve, reviews to publish, questions to answer.
 *
 * Each button is the same step as on the record in Odoo, with the same access rights and the same email to the
 * customer. Anything this screen does not do is one "Open in Odoo" away.
 */

const PER_PAGE = 25

const dateOf = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

function useFilters(defaultStatus) {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || defaultStatus
  const page = Math.max(Number(params.get('page')) || 1, 1)
  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      const drop = value === null || value === undefined || value === '' || (key === 'page' && Number(value) <= 1)
      if (drop) next.delete(key)
      else next.set(key, String(value))
    }
    setParams(next, { replace: true })
  }
  return { params, status, page, update }
}

function Tabs({ label, tabs, value, counts, onChange }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar -mx-1 mt-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => {
        const active = tab.id === value
        const count = tab.count ? counts?.[tab.count] : null
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xs border px-3 py-2 text-[13px] transition-colors ${
              active ? 'border-ink bg-ink text-page' : 'border-line bg-surface text-muted hover:border-ink hover:text-ink'
            }`}
          >
            {tab.label}
            {count != null && <span className={`text-[12px] tabular-nums ${active ? 'text-page/70' : 'text-faint'}`}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function OdooLink({ href }) {
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-[12px] text-muted link-underline">
      Open in Odoo
    </a>
  ) : null
}

function QueueList({ query, empty, children, page, onPage }) {
  const { data, error, loading, reload } = query
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (loading && !data) return <Skeleton className="mt-6 h-64 w-full" />
  if (!data?.items?.length) return <Empty icon="check" title={empty.title} body={empty.body} className="mt-6" />
  return (
    <>
      <ul className="mt-6 space-y-3">{data.items.map(children)}</ul>
      {data.total > PER_PAGE && (
        <div className="mt-6">
          <Pagination page={page} perPage={PER_PAGE} total={data.total} onPage={onPage} />
        </div>
      )}
    </>
  )
}

/** Runs one action on one item and reports it; `busy` is the action running, so a second click waits. */
function useAction(kind, reload) {
  const { push } = useToast()
  const [busy, setBusy] = useState(null)
  const run = async (item, action, body, done) => {
    setBusy(`${item.id}:${action}`)
    try {
      await api.adminUpdateQueueItem(kind, item.id, { action, ...body })
      push(done)
      reload()
      return true
    } catch (err) {
      push(err.message, { tone: 'error' })
      return false
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/* ── returns ───────────────────────────────────────────────────────────── */

const RETURN_TABS = [
  { id: 'open', label: 'To handle', count: 'open' },
  { id: 'requested', label: 'Requested', count: 'requested' },
  { id: 'approved', label: 'Approved', count: 'approved' },
  { id: 'received', label: 'Received', count: 'received' },
  { id: 'all', label: 'All' },
]

const RETURN_STEPS = {
  approve: ['Approve', 'approved'],
  receive: ['Mark as received', 'marked as received'],
  refund: ['Refund', 'refunded'],
  exchange: ['Send a replacement', 'replacement order created'],
  credit: ['Give store credit', 'store credit given'],
}

const RETURN_STATUS = {
  requested: 'Requested',
  approved: 'Approved',
  received: 'Received',
  refunded: 'Refunded',
  exchanged: 'Exchanged',
  credited: 'Store credit given',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

const WANTS = { refund: 'a refund', exchange: 'an exchange', credit: 'store credit' }

export function Returns() {
  const { status, page, update } = useFilters('open')
  const query = useAsync(() => api.adminListQueue('returns', { status, page, perPage: PER_PAGE }), [status, page])
  const { busy, run } = useAction('returns', query.reload)

  return (
    <>
      <h1 className="text-display-md">Returns</h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        Approve a return and Odoo creates the return delivery; mark it received when the parcel is back, then refund,
        send a replacement or give store credit. The customer gets an email at every step.
      </p>
      <Tabs label="Filter returns" tabs={RETURN_TABS} value={status} counts={query.data?.counts} onChange={(id) => update({ status: id, page: null })} />
      <QueueList
        query={query}
        page={page}
        onPage={(next) => update({ page: next })}
        empty={{ title: 'Nothing to handle', body: 'Returns customers ask for on the storefront show up here.' }}
      >
        {(item) => <ReturnCard key={item.id} item={item} busy={busy} run={run} />}
      </QueueList>
    </>
  )
}

function ReturnCard({ item, busy, run }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const steps = (item.actions || []).filter((action) => action !== 'reject')

  return (
    <li className="rounded-xs border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[14px] font-medium">
            {item.number} · order{' '}
            <Link to={`/admin/orders/${encodeURIComponent(item.orderNumber)}`} className="link-underline">{item.orderNumber}</Link>
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {[item.customer?.name, item.customer?.email, dateOf(item.createdAt)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="text-[12px] text-muted">
          {RETURN_STATUS[item.status] || item.status} · wants {WANTS[item.method] || item.method} · {formatMoney(item.value)}
        </p>
      </div>
      <ul className="mt-3 space-y-1 text-[13px]">
        {(item.lines || []).map((line) => (
          <li key={line.lineId}>
            {line.quantity} × {line.title}
            {line.reason && <span className="text-muted"> — {line.reason}</span>}
            {line.comment && <span className="text-faint"> “{line.comment}”</span>}
          </li>
        ))}
      </ul>
      {item.note && <p className="mt-2 text-[13px] text-muted">“{item.note}”</p>}
      {item.rejectReason && <p className="mt-2 text-[13px] text-sale">Rejected: {item.rejectReason}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {steps.map((action, index) => (
          <Button
            key={action}
            size="sm"
            variant={index === 0 ? 'primary' : 'quiet'}
            disabled={Boolean(busy)}
            onClick={() => run(item, action, {}, `${item.number} ${RETURN_STEPS[action]?.[1] || 'updated'}`)}
          >
            {busy === `${item.id}:${action}` ? 'Working…' : RETURN_STEPS[action]?.[0] || action}
          </Button>
        ))}
        {(item.actions || []).includes('reject') && !rejecting && (
          <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => setRejecting(true)}>Reject</Button>
        )}
        <OdooLink href={item.backendUrl} />
      </div>

      {rejecting && (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(item, 'reject', { reason }, `${item.number} rejected`)) setRejecting(false)
          }}
        >
          <div className="min-w-[16rem] flex-1">
            <label htmlFor={`reject-${item.id}`} className="mb-1.5 block text-[13px] font-medium">Why — the customer is told</label>
            <input id={`reject-${item.id}`} className="field" required value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button as="button" type="submit" size="sm" disabled={!reason.trim() || Boolean(busy)}>Reject return</Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
        </form>
      )}
    </li>
  )
}

/* ── reviews and questions ─────────────────────────────────────────────── */

const VIEWS = [
  { id: 'reviews', label: 'Reviews' },
  { id: 'questions', label: 'Questions' },
]

const REVIEW_TABS = [
  { id: 'pending', label: 'To approve', count: 'pending' },
  { id: 'approved', label: 'Published', count: 'approved' },
  { id: 'rejected', label: 'Rejected', count: 'rejected' },
  { id: 'all', label: 'All' },
]

const QUESTION_TABS = [
  { id: 'pending', label: 'To answer', count: 'pending' },
  { id: 'published', label: 'Published', count: 'published' },
  { id: 'rejected', label: 'Rejected', count: 'rejected' },
  { id: 'all', label: 'All' },
]

export function Reviews() {
  const { params, status, page, update } = useFilters('pending')
  const view = params.get('view') === 'questions' ? 'questions' : 'reviews'
  const query = useAsync(() => api.adminListQueue(view, { status, page, perPage: PER_PAGE }), [view, status, page])
  const { busy, run } = useAction(view, query.reload)

  return (
    <>
      <h1 className="text-display-md">Reviews &amp; questions</h1>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
        Publish the reviews and answers shoppers see on product pages. An answered question is emailed to the person
        who asked it.
      </p>
      <div className="mt-6 flex gap-4 border-b border-line" role="tablist" aria-label="Reviews or questions">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => update({ view: v.id === 'reviews' ? null : v.id, status: null, page: null })}
            className={`-mb-px border-b-2 px-1 py-3 text-[13px] ${view === v.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <Tabs
        label={`Filter ${view}`}
        tabs={view === 'reviews' ? REVIEW_TABS : QUESTION_TABS}
        value={status}
        counts={query.data?.counts}
        onChange={(id) => update({ status: id, page: null })}
      />
      <QueueList
        query={query}
        page={page}
        onPage={(next) => update({ page: next })}
        empty={view === 'reviews'
          ? { title: 'No reviews here', body: 'Reviews that wait for approval show up here.' }
          : { title: 'No questions here', body: 'Questions shoppers ask on product pages show up here.' }}
      >
        {(item) => (view === 'reviews'
          ? <ReviewCard key={item.id} item={item} busy={busy} run={run} />
          : <QuestionCard key={item.id} item={item} busy={busy} run={run} />)}
      </QueueList>
    </>
  )
}

function ProductLine({ product, children }) {
  return (
    <p className="text-[12px] text-muted">
      {product?.title}
      {children}
    </p>
  )
}

function ReviewCard({ item, busy, run }) {
  const [reply, setReply] = useState(item.reply || '')
  const canReply = (item.actions || []).includes('reply')

  return (
    <li className="rounded-xs border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <ProductLine product={item.product} />
        <span className="text-[12px] text-muted">{item.status}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Rating value={item.rating} showCount={false} />
        {item.title && <p className="text-[14px] font-medium">{item.title}</p>}
      </div>
      {item.body && <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed">{item.body}</p>}
      <p className="mt-2 text-[12px] text-faint">
        {[item.author, item.email, item.verified ? 'verified buyer' : null, item.photos ? `${item.photos} photo${item.photos === 1 ? '' : 's'}` : null, dateOf(item.createdAt)]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {canReply && (
        <div className="mt-4">
          <label htmlFor={`reply-${item.id}`} className="mb-1.5 block text-[13px] font-medium">Your reply, shown under the review</label>
          <textarea id={`reply-${item.id}`} rows={2} className="field" value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(item.actions || []).includes('approve') && (
          <Button size="sm" disabled={Boolean(busy)} onClick={() => run(item, 'approve', {}, 'Review published')}>
            {busy === `${item.id}:approve` ? 'Working…' : 'Publish'}
          </Button>
        )}
        {canReply && reply !== (item.reply || '') && (
          <Button size="sm" variant="quiet" disabled={Boolean(busy)} onClick={() => run(item, 'reply', { reply }, 'Reply saved')}>
            Save reply
          </Button>
        )}
        {(item.actions || []).includes('reject') && (
          <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => run(item, 'reject', {}, 'Review hidden')}>
            Reject
          </Button>
        )}
        <OdooLink href={item.backendUrl} />
      </div>
    </li>
  )
}

function QuestionCard({ item, busy, run }) {
  const [answer, setAnswer] = useState(item.answer || '')

  return (
    <li className="rounded-xs border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <ProductLine product={item.product} />
        <span className="text-[12px] text-muted">{item.status}</span>
      </div>
      <p className="mt-2 text-[14px] font-medium">{item.question}</p>
      <p className="mt-1 text-[12px] text-faint">{[item.author, item.email, dateOf(item.createdAt)].filter(Boolean).join(' · ')}</p>
      <div className="mt-4">
        <label htmlFor={`answer-${item.id}`} className="mb-1.5 block text-[13px] font-medium">Answer</label>
        <textarea id={`answer-${item.id}`} rows={3} className="field" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={Boolean(busy) || !answer.trim() || (item.status === 'published' && answer === item.answer)}
          onClick={() => run(item, 'publish', { answer }, item.status === 'published' ? 'Answer updated' : 'Answer published and emailed')}
        >
          {busy === `${item.id}:publish` ? 'Working…' : item.status === 'published' ? 'Update answer' : 'Publish answer'}
        </Button>
        {item.status !== 'rejected' && (
          <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => run(item, 'reject', {}, 'Question hidden')}>
            Reject
          </Button>
        )}
        <OdooLink href={item.backendUrl} />
      </div>
    </li>
  )
}
