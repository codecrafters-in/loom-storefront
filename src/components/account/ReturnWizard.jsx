import { useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { Badge, Button, ErrorState, Skeleton } from '../ui/index.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { MAX_RETURN_PHOTOS, MAX_RETURN_PHOTO_BYTES, RETURN_METHOD, RETURN_STATUS, RETURN_TONE } from '../../lib/returns.js'
import { t } from '../../i18n/index.js'

const readPhoto = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, data: reader.result })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/**
 * Returning items from an order: the returns asked for so far, then a form for what can still go back — which items
 * and how many, why, and how the store should make it right. The store reviews it in Odoo and emails each step.
 */
export default function ReturnWizard({ order, onChanged }) {
  const locale = useStorefront().pricing?.locale || 'en-US'
  const { data, error, loading, reload } = useAsync(() => api.getOrderReturns(order.id), [order.id])
  const [picked, setPicked] = useState({})
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [sent, setSent] = useState(null)

  if (loading) return <Skeleton className="mt-4 h-40 w-full" />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const { options, items } = data
  const lines = options.lines || []
  const chosen = Object.entries(picked).filter(([, pick]) => pick.quantity > 0)
  const when = (iso) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })

  const toggle = (line) =>
    setPicked((current) => {
      const next = { ...current }
      if (next[line.lineId]) delete next[line.lineId]
      else next[line.lineId] = { quantity: 1, reasonId: options.reasons[0]?.id || '', comment: '' }
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
      setSent(created)
      setPicked({})
      setPhotos([])
      setNote('')
      reload()
      onChanged?.()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }
  const cancel = async (item) => {
    try {
      await api.cancelReturn(order.id, item.id)
      reload()
      onChanged?.()
    } catch (err) {
      setProblem(err.message)
    }
  }

  return (
    <div className="mt-5 space-y-5">
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xs border border-line p-4 text-[14px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t('Return {number}', { number: item.number })}</span>
                <Badge kind={RETURN_TONE[item.status] || 'new'}>{t(RETURN_STATUS[item.status] || item.status)}</Badge>
              </div>
              <p className="mt-1 text-muted">{item.lines.map((line) => `${line.quantity} × ${line.title}`).join(', ')}</p>
              {item.instructions && <p className="mt-2 whitespace-pre-line text-ink">{item.instructions}</p>}
              {item.rejectReason && <p className="mt-2 text-muted">{item.rejectReason}</p>}
              {item.canCancel && (
                <button type="button" className="mt-2 text-[13px] text-faint link-underline hover:text-sale" onClick={() => cancel(item)}>
                  {t('Cancel this return')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {sent && <p role="status" className="text-[14px] text-good">{t('Return {number} sent. We will email you when we have looked at it.', { number: sent.number })}</p>}

      {lines.length === 0 ? (
        !items.length && <p className="text-[14px] text-muted">{t('Nothing on this order can be returned now.')}</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {options.until && <p className="text-[13px] text-muted">{t('You can return items until {date}.', { date: when(options.until) })}</p>}
          <fieldset className="space-y-3">
            <legend className="mb-2 text-[13px] font-medium">{t('What are you returning?')}</legend>
            {lines.map((line) => {
              const pick = picked[line.lineId]
              return (
                <div key={line.lineId} className="rounded-xs border border-line p-3">
                  <label className="flex items-center gap-3 text-[14px]">
                    <input type="checkbox" checked={Boolean(pick)} onChange={() => toggle(line)} />
                    {line.image?.url && <img src={line.image.url} alt="" className="h-10 w-10 rounded-xs object-cover" loading="lazy" />}
                    <span className="min-w-0 flex-1">
                      {line.title}
                      {Object.values(line.options || {}).length > 0 && <span className="text-muted"> · {Object.values(line.options).join(' / ')}</span>}
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
                      {options.reasons.length > 0 && (
                        <div>
                          <label htmlFor={`reason-${line.lineId}`} className="mb-1 block text-[12px] text-muted">{t('Reason')}</label>
                          <select id={`reason-${line.lineId}`} className="field" value={pick.reasonId} onChange={change(line.lineId, 'reasonId')}>
                            {options.reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
                          </select>
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
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-medium">{t('How should we make it right?')}</legend>
            {options.methods.map((name) => (
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

          {problem && <p className="text-[13px] text-sale">{problem}</p>}
          <Button as="button" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send return request')}</Button>
        </form>
      )}
    </div>
  )
}
