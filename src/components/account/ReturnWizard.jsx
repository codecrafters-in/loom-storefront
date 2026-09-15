import { useEffect, useRef, useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Badge, Button, ErrorState, Icon, Skeleton } from '../ui/index.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import {
  MAX_RETURN_PHOTOS,
  MAX_RETURN_PHOTO_BYTES,
  RETURN_METHOD,
  RETURN_STATUS,
  RETURN_TONE,
  formatDay,
  newestFirst,
  returnExpectation,
  returnNote,
  returnSentMessage,
  unavailableReason,
} from '../../lib/returns.js'
import { t } from '../../i18n/index.js'

const readPhoto = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, data: reader.result })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const optionText = (line) => Object.values(line.options || {}).join(' / ')

/**
 * Returning items from an order: the returns asked for so far (`ReturnList`), then a form for what can still go back
 * (`ReturnForm`) — which items and how many, why, and how the store should make it right. Depending on the store's
 * rules a return is approved (and even refunded) at once, or waits for the team, who email each step.
 *
 * `showForm={false}` lists the returns only, for a page that opens the form with its own button; `onFormDone` runs once
 * a return is sent and `onFormCancel` adds a way to close the form.
 */
export default function ReturnWizard({ order, onChanged, showForm = true, onFormDone, onFormCancel }) {
  const locale = useStorefront().pricing?.locale || 'en-US'
  const { data, error, loading, reload } = useAsync(() => api.getOrderReturns(order.id), [order.id])
  const [sent, setSent] = useState(null)
  const [problem, setProblem] = useState(null)
  const notice = useRef(null)
  const focused = useRef(null)

  // The form closes once a return is sent, so focus moves to the answer, just above the new return on the list, rather
  // than falling back to the top of the page.
  useEffect(() => {
    if (!sent || loading || focused.current === sent.id) return
    focused.current = sent.id
    notice.current?.focus()
  }, [sent, loading])

  const done = (created) => {
    setSent(created)
    setProblem(null)
    reload()
    onChanged?.()
    onFormDone?.()
  }
  const cancel = async (item) => {
    setProblem(null)
    try {
      await api.cancelReturn(order.id, item.id)
      reload()
      onChanged?.()
    } catch (err) {
      setProblem(err.message)
    }
  }

  const items = data?.items || []

  return (
    <>
      {/* Mounted throughout, so the answer to a sent return is announced even while the list reloads. */}
      <div role="status">
        {sent && (
          <p ref={notice} tabIndex={-1} className="mt-4 text-[14px] text-good focus:outline-none">{returnSentMessage(sent)}</p>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : error ? (
        <div className="mt-4"><ErrorState error={error} onRetry={reload} /></div>
      ) : (
        (items.length > 0 || showForm) && (
          <div className="mt-4 space-y-5">
            {items.length > 0 && <ReturnList items={items} onCancel={cancel} />}
            {problem && <p role="alert" className="text-[13px] text-sale">{problem}</p>}
            {showForm && <ReturnForm order={order} options={data.options || {}} locale={locale} onSent={done} onCancel={onFormCancel} />}
          </div>
        )
      )}
    </>
  )
}

/** The returns on an order, newest first: where each one stands and what happens next. */
export function ReturnList({ items, onCancel }) {
  return (
    <ul className="space-y-3">
      {newestFirst(items).map((item) => {
        const note = returnNote(item)
        return (
          <li key={item.id} className="rounded-xs border border-line p-4 text-[14px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{t('Return {number}', { number: item.number })}</span>
              <Badge kind={RETURN_TONE[item.status] || 'new'}>{t(RETURN_STATUS[item.status] || item.status)}</Badge>
            </div>
            <p className="mt-1 text-muted">{(item.lines || []).map((line) => `${line.quantity} × ${line.title}`).join(', ')}</p>
            {/* How to send the items back matters only until they are on their way. */}
            {item.instructions && item.status === 'approved' && <p className="mt-2 whitespace-pre-line text-ink">{item.instructions}</p>}
            {item.rejectReason && <p className="mt-2 whitespace-pre-line text-muted">{item.rejectReason}</p>}
            {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
            {item.canCancel && onCancel && (
              <button type="button" className="mt-2 text-[13px] text-faint link-underline hover:text-sale" onClick={() => onCancel(item)}>
                {t('Cancel this return')}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * What can still go back (`options.lines`), with what cannot shown beside it and why (`options.unavailable`), and a
 * line on what to expect before sending: approved at once or reviewed first, and when a refund starts.
 */
export function ReturnForm({ order, options, locale = 'en-US', onSent, onCancel }) {
  const [picked, setPicked] = useState({})
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)

  const lines = options.lines || []
  const unavailable = options.unavailable || []
  const reasons = options.reasons || []
  const chosen = Object.entries(picked).filter(([, pick]) => pick.quantity > 0)
  // One date for the whole order reads better than the same date on every line; lines only get their own when they differ.
  const days = new Set(lines.map((line) => formatDay(line.until || options.until, locale)).filter(Boolean))
  const perLine = days.size > 1
  const until = perLine ? null : options.until || lines.find((line) => line.until)?.until
  const expectation = returnExpectation(options, method)
  const reviewed = (reasonId) => options.approval !== 'team' && reasons.find((reason) => String(reason.id) === String(reasonId))?.needsReview

  const toggle = (line) =>
    setPicked((current) => {
      const next = { ...current }
      if (next[line.lineId]) delete next[line.lineId]
      else next[line.lineId] = { quantity: 1, reasonId: reasons[0]?.id || '', comment: '' }
      return next
    })
  const change = (lineId, key) => (e) => {
    const value = key === 'quantity' ? Number(e.target.value) : e.target.value
    setPicked((current) => ({ ...current, [lineId]: { ...current[lineId], [key]: value } }))
  }
  const addPhotos = async (e) => {
    const files = [...e.target.files].slice(0, MAX_RETURN_PHOTOS)
    if (files.some((file) => file.size > MAX_RETURN_PHOTO_BYTES)) {
      setProblem(t('Photos must be 5 MB or less.'))
      return
    }
    try {
      setPhotos(await Promise.all(files.map(readPhoto)))
      setProblem(null)
    } catch {
      setProblem(t('That photo could not be read.'))
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!chosen.length) return setProblem(t('Choose at least one item to return.'))
    if (!method) return setProblem(t('Choose how you would like us to make it right.'))
    setBusy(true)
    setProblem(null)
    try {
      const created = await api.createReturn(order.id, {
        method, note, photos,
        lines: chosen.map(([lineId, pick]) => ({ lineId, ...pick })),
      })
      setPicked({})
      setPhotos([])
      setNote('')
      onSent?.(created)
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!lines.length) {
    return (
      <div className="space-y-3">
        <p className="text-[14px] text-muted">{t('Nothing on this order can be returned now.')}</p>
        {unavailable.length > 0 && <div className="space-y-3">{unavailable.map((line) => <UnavailableLine key={line.lineId} line={line} locale={locale} />)}</div>}
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {until && <p className="text-[13px] text-muted">{t('You can return items until {date}.', { date: formatDay(until, locale) })}</p>}
      <fieldset className="space-y-3">
        <legend className="mb-2 text-[13px] font-medium">{t('What are you returning?')}</legend>
        {lines.map((line) => {
          const pick = picked[line.lineId]
          const hint = pick && reviewed(pick.reasonId)
          return (
            <div key={line.lineId} className="rounded-xs border border-line p-3">
              <label className="flex items-center gap-3 text-[14px]">
                <input type="checkbox" checked={Boolean(pick)} onChange={() => toggle(line)} />
                {line.image?.url && <img src={line.image.url} alt="" className="h-10 w-10 rounded-xs object-cover" loading="lazy" />}
                <span className="min-w-0 flex-1">
                  {line.title}
                  {optionText(line) && <span className="text-muted"> · {optionText(line)}</span>}
                  {perLine && (line.until || options.until) && (
                    <span className="block text-[12px] text-muted">{t('Returnable until {date}', { date: formatDay(line.until || options.until, locale) })}</span>
                  )}
                </span>
              </label>
              {pick && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[6rem_1fr]">
                  <div>
                    <label htmlFor={`qty-${line.lineId}`} className="mb-1 block text-[12px] text-muted">{t('Quantity')}</label>
                    <select id={`qty-${line.lineId}`} className="field" value={pick.quantity} onChange={change(line.lineId, 'quantity')}>
                      {Array.from({ length: Math.max(1, Math.floor(line.returnable)) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  {reasons.length > 0 && (
                    <div>
                      <label htmlFor={`reason-${line.lineId}`} className="mb-1 block text-[12px] text-muted">{t('Reason')}</label>
                      <select
                        id={`reason-${line.lineId}`}
                        className="field"
                        value={pick.reasonId}
                        onChange={change(line.lineId, 'reasonId')}
                        aria-describedby={hint ? `reason-hint-${line.lineId}` : undefined}
                      >
                        {reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
                      </select>
                      {hint && <p id={`reason-hint-${line.lineId}`} className="mt-1 text-[12px] text-muted">{t('We check returns like this one first.')}</p>}
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label htmlFor={`comment-${line.lineId}`} className="mb-1 block text-[12px] text-muted">{t('Anything to add? (optional)')}</label>
                    <input id={`comment-${line.lineId}`} className="field" maxLength={500} value={pick.comment} onChange={change(line.lineId, 'comment')} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {unavailable.map((line) => <UnavailableLine key={line.lineId} line={line} locale={locale} />)}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium">{t('How should we make it right?')}</legend>
        {(options.methods || []).map((name) => (
          <label key={name} className="flex items-center gap-2.5 text-[14px]">
            <input type="radio" name="return-method" value={name} checked={method === name} onChange={() => setMethod(name)} />
            {t(RETURN_METHOD[name] || name)}
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="return-note" className="mb-1.5 block text-[13px] font-medium">{t('Note for the store (optional)')}</label>
        <textarea id="return-note" rows={2} maxLength={2000} className="field h-auto py-2" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div>
        <label htmlFor="return-photos" className="mb-1.5 block text-[13px] font-medium">{t('Photos (optional, up to {count})', { count: MAX_RETURN_PHOTOS })}</label>
        <input id="return-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} className="text-[13px]" />
      </div>

      {expectation && (
        <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
          <Icon name="info" size={15} className="mt-0.5 shrink-0 text-faint" />
          <span>{expectation}</span>
        </p>
      )}
      {problem && <p role="alert" className="text-[13px] text-sale">{problem}</p>}
      <div className="flex flex-wrap gap-3">
        <Button as="button" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send return request')}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('Cancel')}</Button>}
      </div>
    </form>
  )
}

/** A delivered item that cannot go back, greyed, with the reason: a final sale, or its window has ended. */
function UnavailableLine({ line, locale }) {
  return (
    <div className="rounded-xs border border-dashed border-line bg-sunken/40 p-3">
      <label className="flex items-center gap-3 text-[14px] text-muted">
        <input type="checkbox" disabled />
        {line.image?.url && <img src={line.image.url} alt="" className="h-10 w-10 rounded-xs object-cover opacity-60 grayscale" loading="lazy" />}
        <span className="min-w-0 flex-1">
          {line.title}
          {optionText(line) && <span> · {optionText(line)}</span>}
          <span className="block text-[12px]">{unavailableReason(line, locale)}</span>
        </span>
      </label>
    </div>
  )
}
