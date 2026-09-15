import { useState } from 'react'
import api from '../../lib/api/index.js'
import useAsync from '../../hooks/useAsync.js'
import { useAuth } from '../../store/AuthContext.jsx'
import { useCaptcha } from '../Captcha.jsx'
import { withCaptcha } from '../../lib/captcha.js'
import { Button, Skeleton } from '../ui/index.jsx'
import { t } from '../../i18n/index.js'

/**
 * Questions and answers (`features.questions`): answered questions, newest answers first, and a form to ask one.
 * The store answers in Odoo; the asker is emailed when the answer is published.
 */
export default function ProductQuestions({ product }) {
  const { signedIn } = useAuth()
  const [page, setPage] = useState(1)
  const { data, loading } = useAsync(() => api.getQuestions(product.slug, { page }), [product.slug, page])
  const [asking, setAsking] = useState(false)
  const [form, setForm] = useState({ question: '', name: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [sent, setSent] = useState(false)
  const captcha = useCaptcha('question', { defer: true })

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((current) => ({ ...current, [key]: value }))
  }
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      const body = signedIn ? { question: form.question } : form
      await api.askQuestion(product.slug, withCaptcha(body, await captcha.getToken()))
      setSent(true)
      setAsking(false)
      setForm({ question: '', name: '', email: '' })
    } catch (err) {
      captcha.reset()
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  const items = data?.items || []
  const more = data && page * data.perPage < data.total

  return (
    <section id="questions" className="border-t border-line">
      <div className="wrap wrap-tight grid gap-10 py-16 md:grid-cols-[18rem_1fr]">
        <div>
          <h2 className="text-display-md">{t('Questions')}</h2>
          <p className="mt-3 text-[14px] text-muted">{t('Ask about sizing, materials or care. We answer by email and here.')}</p>
          {!asking && (
            <Button size="sm" variant="quiet" className="mt-6" onClick={() => { setAsking(true); setSent(false) }}>{t('Ask a question')}</Button>
          )}
          {sent && <p role="status" className="mt-4 text-[14px] text-good">{t('Thank you! We will email you the answer.')}</p>}
        </div>
        <div>
          {asking && (
            <form onSubmit={submit} className="mb-8 space-y-4 rounded-xs border border-line bg-surface p-5">
              <div>
                <label htmlFor="question-text" className="mb-1.5 block text-[13px] font-medium">{t('Your question')}</label>
                <textarea id="question-text" required minLength={5} maxLength={1000} rows={3} className="field h-auto py-2" value={form.question} onChange={set('question')} autoFocus />
              </div>
              {!signedIn && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="question-name" className="mb-1.5 block text-[13px] font-medium">{t('Name')}</label>
                    <input id="question-name" required maxLength={80} className="field" value={form.name} onChange={set('name')} autoComplete="name" />
                  </div>
                  <div>
                    <label htmlFor="question-email" className="mb-1.5 block text-[13px] font-medium">{t('Email (not shown)')}</label>
                    <input id="question-email" type="email" required className="field" value={form.email} onChange={set('email')} autoComplete="email" />
                  </div>
                </div>
              )}
              {captcha.widget}
              {problem && <p className="text-[13px] text-sale">{problem}</p>}
              <div className="flex flex-wrap gap-3">
                <Button as="button" type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send question')}</Button>
                <Button variant="ghost" onClick={() => setAsking(false)} disabled={busy}>{t('Cancel')}</Button>
              </div>
            </form>
          )}
          {loading && !items.length ? (
            <Skeleton className="h-24 w-full" />
          ) : items.length ? (
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li key={item.id} className="py-5 first:pt-0">
                  <p className="text-[14px] font-medium text-ink">{item.question}</p>
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-muted">{item.answer}</p>
                  {item.author && <p className="mt-2 text-[12px] text-faint">{t('Asked by {name}', { name: item.author })}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-muted">{t('No questions yet. Be the first to ask.')}</p>
          )}
          {more && <Button size="sm" variant="ghost" className="mt-4" onClick={() => setPage((p) => p + 1)}>{t('More questions')}</Button>}
        </div>
      </div>
    </section>
  )
}
