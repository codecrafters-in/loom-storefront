import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Icon } from '../ui/index.jsx'
import api, { isMock } from '../../lib/api/index.js'
import { useToast } from '../../store/ToastContext.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { useAdminAuth } from '../../store/AdminAuthContext.jsx'
import Logo from '../ui/Logo.jsx'
import { config as envConfig } from '../../lib/config.js'
import { docsLinkVisible } from '../../lib/docs-link.js'
import { useCaptcha } from '../Captcha.jsx'
import ContactDetails from '../content/ContactDetails.jsx'
import { t } from '../../i18n/index.js'

export default function Footer() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const { push } = useToast()
  const config = useStorefront()
  const { signedIn: isAdmin } = useAdminAuth()
  // Deferred to the first focus: this footer is on every page, and a captcha
  // script on every page is a cost every shopper pays for one small form.
  const captcha = useCaptcha('newsletter', { defer: true })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const captchaToken = await captcha.getToken()
      await api.subscribe(email, { captchaToken })
      setEmail('')
      push(t('Thanks — check your inbox to confirm.'))
    } catch (err) {
      push(err.message || t('Could not subscribe.'), { tone: 'error' })
    } finally {
      // Single-use, and the form stays on screen for another address.
      captcha.reset()
      setBusy(false)
    }
  }

  const cols = config.navigation?.footer || []

  /**
   * The documentation is public, but it is developer furniture: it belongs in
   * the utility bar beside "Source", not in the merchant's own footer columns.
   */
  const showDocs = docsLinkVisible(config)

  return (
    <footer className="mt-24 border-t border-line bg-sunken/50">
      <div className="wrap grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link to="/"><Logo config={config} size={26} /></Link>
          {config.store?.tagline && <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted">{config.store.tagline}</p>}
          <ContactDetails contact={config.store?.contact} compact className="mt-5" />

          {config.features?.newsletter !== false && (
          <form onSubmit={submit} className="mt-8 max-w-sm">
            <label htmlFor="newsletter" className="eyebrow">{t('Newsletter')}</label>
            <div className="mt-3 flex gap-2">
              <input
                id="newsletter"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={captcha.activate}
                placeholder="you@example.com"
                className="field"
              />
              <Button type="submit" as="button" disabled={busy} className="shrink-0">
                {busy ? '…' : t('Join')}
              </Button>
            </div>
            {captcha.widget && <div className="mt-3">{captcha.widget}</div>}
          </form>
          )}
        </div>

        {cols.map(({ title, links }) => (
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
            © {new Date().getFullYear()} {config.store?.contact?.legalName || config.store?.name}
            {config.store?.contact?.vat ? ` · ${config.store.contact.vat}` : ''}
            {isMock ? (
              <>
                . {t('A storefront theme by')}{' '}
                <a href="https://codecrafters.in" className="link-underline text-muted" target="_blank" rel="noreferrer">
                  CodeCrafters
                </a>
                . {t('MIT licensed.')}
              </>
            ) : (
              config.store?.credit ? ` · ${config.store.credit}` : ''
            )}
          </p>
          <div className="flex items-center gap-4">
            {config.consent?.enabled && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('loom:consent-open'))}
                className="text-[13px] text-muted transition-colors hover:text-ink"
              >
                {t('Cookie settings')}
              </button>
            )}
            {isMock && (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint" title={t('Running on the bundled catalogue')}>
                {t('demo data')}
              </span>
            )}
            {/* Only rendered for a signed-in admin — a shopper never sees that
                a back office exists. */}
            {isAdmin && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-xs border border-accent/40 px-2.5 py-1 text-[12px] text-accent transition-colors hover:bg-accent hover:text-accent-ink"
              >
                <Icon name="user" size={13} />
                {t('Admin')}
              </Link>
            )}
            {showDocs && (
              <Link
                to="/docs"
                className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
              >
                <Icon name="info" size={16} />
                {t('Docs & API')}
              </Link>
            )}
            {isMock && (
              <a
                href={envConfig.repoUrl || 'https://github.com/codecrafters-in/loom-storefront'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
              >
                <Icon name="github" size={16} />
                {t('Source')}
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
