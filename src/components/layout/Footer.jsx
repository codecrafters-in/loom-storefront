import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Icon } from '../ui/index.jsx'
import { site } from '../../data/site.js'
import api, { isMock } from '../../lib/api/index.js'
import { useToast } from '../../store/ToastContext.jsx'

export default function Footer() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const { push } = useToast()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.subscribe(email)
      setEmail('')
      push('Thanks — check your inbox to confirm.')
    } catch (err) {
      push(err.message || 'Could not subscribe.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const cols = [
    ['Shop', site.footer.shop],
    ['Account', site.footer.account],
    ['Help', site.footer.about],
  ]

  return (
    <footer className="mt-24 border-t border-line bg-sunken/50">
      <div className="wrap grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link to="/" className="font-display text-2xl">{site.name}</Link>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted">{site.tagline}</p>

          <form onSubmit={submit} className="mt-8 max-w-sm">
            <label htmlFor="newsletter" className="eyebrow">Letters, occasionally</label>
            <div className="mt-3 flex gap-2">
              <input
                id="newsletter"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="field"
              />
              <Button type="submit" as="button" disabled={busy} className="shrink-0">
                {busy ? '…' : 'Join'}
              </Button>
            </div>
          </form>
        </div>

        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="eyebrow">{title}</h2>
            <ul className="mt-5 space-y-3">
              {links.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-[15px] text-muted transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-faint">
            © {new Date().getFullYear()} {site.name}. A storefront theme by{' '}
            <a href="https://codecrafters.in" className="link-underline text-muted" target="_blank" rel="noreferrer">
              CodeCrafters
            </a>
            . MIT licensed.
          </p>
          <div className="flex items-center gap-4">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint"
              title={isMock ? 'Running on the bundled catalogue' : 'Running against a live API'}
            >
              {isMock ? 'demo data' : 'live api'}
            </span>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
            >
              <Icon name="github" size={16} />
              Source
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
