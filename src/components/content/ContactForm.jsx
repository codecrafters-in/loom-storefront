import { useEffect, useState } from 'react'
import api from '../../lib/api/index.js'
import { Button } from '../ui/index.jsx'
import { useCaptcha } from '../Captcha.jsx'
import { useAuth } from '../../store/AuthContext.jsx'
import { fieldErrors } from '../../lib/errors.js'
import { prefillContact } from '../../lib/prefill.js'
import { t, mark } from '../../i18n/index.js'

/**
 * The contact form block of a store page. Sent to `POST /contact`, which keeps
 * the message in the backend and emails the store. Its own chunk: only the
 * contact page needs it.
 */
const EMPTY = { name: '', email: '', phone: '', order: '', subject: '', message: '' }
const FIELDS = Object.keys(EMPTY)

/** Said under a field the backend refused (`422` with `detail.fields`). */
const FIELD_MESSAGES = {
  name: mark('Enter your name.'),
  email: mark('Enter a valid email address.'),
  message: mark('Write your message.'),
}

export default function ContactForm() {
  const { customer } = useAuth()
  const [form, setForm] = useState(() => prefillContact(EMPTY, customer))
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(() => new Set())
  // Deferred to the first focus, like the footer's newsletter: many visitors read a contact page for the address.
  const captcha = useCaptcha('contact', { defer: true })

  // The account arrives after the page does: fill the name and email then, never over what was typed.
  useEffect(() => {
    if (customer) setForm((current) => prefillContact(current, customer))
  }, [customer])

  const set = (key) => (e) => {
    const { value } = e.target
    setForm((current) => ({ ...current, [key]: value }))
    // Typing in a field the backend refused clears its message.
    setInvalid((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInvalid(new Set())
    try {
      const captchaToken = await captcha.getToken()
      await api.sendContact({ ...form, captchaToken })
      setSent(form)
      setForm(prefillContact(EMPTY, customer))
    } catch (err) {
      const fields = fieldErrors(err)
      setInvalid(fields)
      setError(err.message || t('Your message could not be sent. Please try again.'))
      // To the first field the backend named, in the order of the form.
      const first = FIELDS.find((field) => fields.has(field))
      if (first) document.getElementById(`contact-${first}`)?.focus()
    } finally {
      captcha.reset()
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p role="status" className="mt-5 rounded-xs border border-line bg-surface p-5 text-[15px] leading-relaxed">
        {sent.name
          ? t('Thank you, {name}. Your message was sent, and we will reply to {email}.', { name: sent.name.split(' ')[0], email: sent.email })
          : t('Thank you. Your message was sent, and we will reply to {email}.', { email: sent.email })}
      </p>
    )
  }

  const input = (id, label, props = {}) => {
    const wrong = invalid.has(id)
    const shared = {
      id: `contact-${id}`,
      required: props.required,
      value: form[id],
      onChange: set(id),
      'aria-invalid': wrong || undefined,
      'aria-describedby': wrong ? `contact-${id}-error` : undefined,
    }
    return (
      <div className={props.wide ? 'sm:col-span-2' : ''}>
        <label htmlFor={`contact-${id}`} className="mb-1.5 block text-[13px] font-medium">
          {label}
          {props.required && <span className="text-muted"> *</span>}
        </label>
        {props.textarea ? (
          <textarea {...shared} rows={6} maxLength={5000} className={`field min-h-[9rem] py-3 ${wrong ? 'border-sale' : ''}`} />
        ) : (
          <input
            {...shared}
            type={props.type || 'text'}
            autoComplete={props.autoComplete}
            maxLength={props.maxLength || 160}
            className={`field ${wrong ? 'border-sale' : ''}`}
          />
        )}
        {wrong && (
          <p id={`contact-${id}-error`} className="mt-1.5 text-[13px] text-sale">
            {t(FIELD_MESSAGES[id] || mark('Check this field.'))}
          </p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} onFocus={captcha.activate} className="mt-5 grid gap-4 sm:grid-cols-2">
      {input('name', t('Name'), { required: true, autoComplete: 'name', maxLength: 120 })}
      {input('email', t('Email'), { required: true, type: 'email', autoComplete: 'email', maxLength: 254 })}
      {input('phone', t('Phone'), { type: 'tel', autoComplete: 'tel', maxLength: 40 })}
      {input('order', t('Order number'), { maxLength: 64 })}
      {input('subject', t('Subject'), { wide: true })}
      {input('message', t('Message'), { required: true, textarea: true, wide: true })}
      {captcha.widget && <div className="sm:col-span-2">{captcha.widget}</div>}
      {error && <p role="alert" className="text-[14px] text-sale sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? t('Sending…') : t('Send message')}</Button>
      </div>
    </form>
  )
}
