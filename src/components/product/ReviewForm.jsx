import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../../lib/api/index.js'
import { useAuth } from '../../store/AuthContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { useCaptcha } from '../Captcha.jsx'
import { withCaptcha } from '../../lib/captcha.js'
import { Button, Icon } from '../ui/index.jsx'
import { t, mark } from '../../i18n/index.js'

const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const readPhoto = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, data: reader.result })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const FITS = [['true', mark('True to size')], ['small', mark('Runs small')], ['large', mark('Runs large')]]

/**
 * Writing a review: stars, a title and a few words, how it fitted for things with a size, and up to three photos.
 * Who may write one is the store's policy (`features.reviewPolicy`); with moderation the review shows once approved.
 */
export default function ReviewForm({ product, onDone, onCancel }) {
  const { signedIn } = useAuth()
  const policy = useStorefront().features?.reviewPolicy || 'buyers'
  const { pathname } = useLocation()
  const captcha = useCaptcha('review')
  const [form, setForm] = useState({ rating: 0, title: '', body: '', size: '', height: '', fit: '', name: '', email: '' })
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [status, setStatus] = useState(null)
  const sized = (product.options || []).some((option) => option.role === 'size')

  if (!signedIn && policy !== 'anyone') {
    return (
      <p className="mb-8 text-[14px] text-muted">
        <Link to="/login" state={{ from: `${pathname}?review=1` }} className="link-underline text-ink">{t('Sign in to write a review.')}</Link>
        {policy === 'buyers' && <> {t('Reviews come from customers who bought it.')}</>}
      </p>
    )
  }
  if (status) {
    return (
      <p role="status" className="mb-8 text-[14px] text-good">
        {status === 'pending' ? t('Thank you! Your review will show once we have read it.') : t('Thank you! Your review is live.')}
      </p>
    )
  }

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((current) => ({ ...current, [key]: value }))
  }
  const addPhotos = async (e) => {
    const files = [...e.target.files].slice(0, MAX_PHOTOS)
    if (files.some((file) => file.size > MAX_PHOTO_BYTES)) return setProblem(t('Photos must be 5 MB or less.'))
    try {
      setPhotos(await Promise.all(files.map(readPhoto)))
      setProblem(null)
    } catch {
      setProblem(t('That photo could not be read.'))
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!form.rating) return setProblem(t('Choose from 1 to 5 stars.'))
    setBusy(true)
    setProblem(null)
    try {
      const { name, email, ...review } = form
      const body = { ...review, photos, ...(signedIn ? {} : { name, email }) }
      const created = await api.createReview(product.slug, withCaptcha(body, await captcha.getToken()))
      setStatus(created.status)
      onDone?.(created)
    } catch (err) {
      captcha.reset()
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-10 space-y-4 rounded-xs border border-line bg-page p-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">{t('Your rating')}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-xs p-0.5 focus-within:ring-2 focus-within:ring-accent">
              <input
                type="radio" name="review-rating" value={n} className="sr-only"
                checked={form.rating === n} onChange={() => setForm((current) => ({ ...current, rating: n }))}
              />
              <Icon name="star" size={24} filled={n <= form.rating} className={n <= form.rating ? 'text-accent' : 'text-line'} />
              <span className="sr-only">{t('{value} out of 5', { value: n })}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="review-title" className="mb-1.5 block text-[13px] font-medium">{t('Title (optional)')}</label>
        <input id="review-title" className="field" maxLength={120} value={form.title} onChange={set('title')} />
      </div>
      <div>
        <label htmlFor="review-body" className="mb-1.5 block text-[13px] font-medium">{t('Your review')}</label>
        <textarea id="review-body" required minLength={3} maxLength={5000} rows={4} className="field h-auto py-2" value={form.body} onChange={set('body')} />
      </div>
      {sized && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="review-size" className="mb-1.5 block text-[13px] font-medium">{t('Size bought (optional)')}</label>
            <input id="review-size" className="field" maxLength={40} value={form.size} onChange={set('size')} />
          </div>
          <div>
            <label htmlFor="review-height" className="mb-1.5 block text-[13px] font-medium">{t('Your height (optional)')}</label>
            <input id="review-height" className="field" maxLength={40} value={form.height} onChange={set('height')} />
          </div>
          <div>
            <label htmlFor="review-fit" className="mb-1.5 block text-[13px] font-medium">{t('Fit (optional)')}</label>
            <select id="review-fit" className="field" value={form.fit} onChange={set('fit')}>
              <option value="">—</option>
              {FITS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
        </div>
      )}
      {!signedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="review-name" className="mb-1.5 block text-[13px] font-medium">{t('Name')}</label>
            <input id="review-name" required className="field" maxLength={80} value={form.name} onChange={set('name')} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="review-email" className="mb-1.5 block text-[13px] font-medium">{t('Email (not shown)')}</label>
            <input id="review-email" type="email" required className="field" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
        </div>
      )}
      <div>
        <label htmlFor="review-photos" className="mb-1.5 block text-[13px] font-medium">{t('Photos (optional, up to {count})', { count: MAX_PHOTOS })}</label>
        <input id="review-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} className="text-[13px]" />
      </div>
      {captcha.widget}
      {problem && <p className="text-[13px] text-sale">{problem}</p>}
      <div className="flex flex-wrap gap-3">
        <Button as="button" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Post review')}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('Cancel')}</Button>}
      </div>
    </form>
  )
}
