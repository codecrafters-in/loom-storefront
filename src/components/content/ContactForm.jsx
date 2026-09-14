import { useState } from 'react'
import api from '../../lib/api/index.js'
import { Button } from '../ui/index.jsx'
import { useCaptcha } from '../Captcha.jsx'

/**
 * The contact form block of a store page. Sent to `POST /contact`, which keeps
 * the message in the backend and emails the store. Its own chunk: only the
 * contact page needs it.
 */
const EMPTY = { name: '', email: '', phone: '', order: '', subject: '', message: '' }

export default function ContactForm() {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')
  const captcha = useCaptcha('contact')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const captchaToken = await captcha.getToken()
      await api.sendContact({ ...form, captchaToken })
      setSent(form)
      setForm(EMPTY)
    } catch (err) {
      setError(err.message || 'Your message could not be sent. Please try again.')
    } finally {
      captcha.reset()
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p role="status" className="mt-5 rounded-xs border border-line bg-surface p-5 text-[15px] leading-relaxed">
        Thank you{sent.name ? `, ${sent.name.split(' ')[0]}` : ''}. Your message was sent, and we will reply to {sent.email}.
      </p>
    )
  }

  const input = (id, label, props = {}) => (
    <div className={props.wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={`contact-${id}`} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {props.required && <span className="text-muted"> *</span>}
      </label>
      {props.textarea ? (
        <textarea id={`contact-${id}`} rows={6} required={props.required} maxLength={5000} value={form[id]} onChange={set(id)} className="field min-h-[9rem] py-3" />
      ) : (
        <input
          id={`contact-${id}`}
          type={props.type || 'text'}
          required={props.required}
          autoComplete={props.autoComplete}
          maxLength={props.maxLength || 160}
          value={form[id]}
          onChange={set(id)}
          className="field"
        />
      )}
    </div>
  )

  return (
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      {input('name', 'Name', { required: true, autoComplete: 'name', maxLength: 120 })}
      {input('email', 'Email', { required: true, type: 'email', autoComplete: 'email', maxLength: 254 })}
      {input('phone', 'Phone', { type: 'tel', autoComplete: 'tel', maxLength: 40 })}
      {input('order', 'Order number', { maxLength: 64 })}
      {input('subject', 'Subject', { wide: true })}
      {input('message', 'Message', { required: true, textarea: true, wide: true })}
      {captcha.widget && <div className="sm:col-span-2">{captcha.widget}</div>}
      {error && <p role="alert" className="text-[14px] text-sale sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</Button>
      </div>
    </form>
  )
}
