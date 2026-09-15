import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionHead from './SectionHead.jsx'
import { Button, Icon, Price, Rating } from '../ui/index.jsx'
import { hasIcon } from '../ui/Icon.jsx'
import Media from '../ui/Media.jsx'
import useNewsletter from '../../hooks/useNewsletter.js'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { SIZES } from '../../lib/images.js'
import { pad, timeLeft } from '../../lib/countdown.js'
import {
  actionsOf,
  faqOf,
  featuredProductOf,
  featuresGrid,
  featuresOf,
  imageOf,
  isExternal,
  logoRow,
  logosOf,
  onDark,
  paragraphs,
  testimonialsGrid,
  testimonialsOf,
  tilesLayout,
  tilesOf,
} from '../../lib/home-sections.js'
import { mark, t } from '../../i18n/index.js'

/**
 * The newer home section types: image-banner, image-tiles, features, testimonials, logo-bar, faq, newsletter,
 * featured-product and countdown.
 *
 * A chunk of its own (see load-more.js), registered in sections.jsx. What each section can draw is decided in
 * lib/home-sections.js: an item missing what it needs is left out, and a section left with nothing renders nothing.
 * Each root carries `data-home-section`, which tells the browser to load this chunk before hydrating the page.
 */

/* ── shared ────────────────────────────────────────────────────────────── */

/** A link from the backend: through the router on this site, a plain link anywhere else (a new tab for a website). */
function To({ to, children, ...rest }) {
  if (!isExternal(to)) return <Link to={to} {...rest}>{children}</Link>
  const website = /^(?:https?:)?\/\//i.test(to)
  return (
    <a href={to} {...(website ? { target: '_blank', rel: 'noreferrer' } : {})} {...rest}>
      {children}
    </a>
  )
}

const goes = (to) => (isExternal(to) ? { href: to } : { to })

function Actions({ actions, dark = false, className = '' }) {
  if (!actions.length) return null
  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      {actions.map((action) => {
        const look = dark ? onDark(action.variant) : { variant: action.variant, className: '' }
        return (
          <Button key={`${action.label}-${action.to}`} {...goes(action.to)} size="lg" variant={look.variant} className={look.className}>
            {action.label}
          </Button>
        )
      })}
    </div>
  )
}

/** Eyebrow, title and "See all", then the section's text; nothing at all when a section has none of them. */
function Intro({ section }) {
  const body = paragraphs(section.body)
  const head = section.title || section.eyebrow || section.ctaTo
  if (!head && !body.length) return null
  return (
    <div className="mb-8 md:mb-10">
      {head && <SectionHead {...section} />}
      {body.map((p, i) => (
        <p key={i} className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">{p}</p>
      ))}
    </div>
  )
}

const Arrow = ({ size = 15 }) => <Icon name="arrow-right" size={size} className="shrink-0 rtl:-scale-x-100" />

/* ── image-banner ──────────────────────────────────────────────────────── */

/** A wide photograph with copy over it: the hero's shape, lower, for the middle of the page. */
export function ImageBanner({ section }) {
  const image = imageOf(section.image)
  if (!image) return null
  const center = section.align === 'center'
  const body = paragraphs(section.body)
  return (
    <section data-home-section="image-banner" className="relative">
      <div className="relative h-[360px] w-full overflow-hidden bg-sunken md:h-[460px] lg:h-[520px]">
        <Media
          src={image.url}
          srcset={image.srcset}
          alt={image.alt}
          sizes={SIZES.full}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          style={{ objectPosition: section.focal || '50% 50%' }}
        />
        {/* Centred copy sits mid-photo, so the whole photo is darkened; copy at the start sits low, over a gradient. */}
        {center ? (
          <div className="absolute inset-0 bg-ink/45" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/25 to-transparent" />
        )}
        <div className={`wrap absolute inset-0 flex flex-col py-10 md:py-14 ${center ? 'items-center justify-center text-center' : 'justify-end'}`}>
          {section.eyebrow && <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-page/80">{section.eyebrow}</p>}
          {section.title && <h2 className={`max-w-2xl text-display-lg text-page ${section.eyebrow ? 'mt-3' : ''}`}>{section.title}</h2>}
          {body.map((p, i) => (
            <p key={i} className="mt-4 max-w-lg text-[15px] leading-relaxed text-page/85">{p}</p>
          ))}
          <Actions actions={actionsOf(section.actions, 2)} dark className={`mt-7 ${center ? 'justify-center' : ''}`} />
        </div>
      </div>
    </section>
  )
}

/* ── image-tiles ───────────────────────────────────────────────────────── */

/** Two to four large photographs, each one link, with the title over the photo. */
export function ImageTiles({ section }) {
  const items = tilesOf(section.items)
  const layout = tilesLayout(items.length)
  if (!layout) return null
  return (
    <section data-home-section="image-tiles" className="wrap py-16 md:py-20">
      <Intro section={section} />
      <ul className={`grid gap-3 sm:gap-5 ${layout.grid}`}>
        {items.map((item, i) => (
          <li key={`${i}-${item.to}`}>
            <To to={item.to} className="group relative block overflow-hidden rounded-xs bg-sunken">
              <div className={`relative ${layout.shot}`}>
                {/* The title names the link; the photo would only say it twice. */}
                <Media
                  src={item.image.url}
                  srcset={item.image.srcset}
                  alt=""
                  sizes={layout.sizes}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                  <h3 className="font-display text-lg leading-tight text-page sm:text-2xl">{item.title}</h3>
                  {item.body && (
                    <p className={`mt-1.5 max-w-sm text-[14px] leading-relaxed text-page/85 ${layout.compact ? 'hidden sm:block' : ''}`}>{item.body}</p>
                  )}
                  {item.label && (
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-page underline decoration-page/40 underline-offset-4 transition-colors group-hover:decoration-page">
                      {item.label} <Arrow size={14} />
                    </span>
                  )}
                </div>
              </div>
            </To>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── features ──────────────────────────────────────────────────────────── */

/** Columns of an icon (or a small photo), a title, a few words and perhaps a link, in even rows. */
export function Features({ section }) {
  const items = featuresOf(section.items)
  if (!items.length) return null
  return (
    <section data-home-section="features" className="wrap py-16 md:py-20">
      <Intro section={section} />
      <ul className={`grid gap-x-8 gap-y-10 ${featuresGrid(items.length)}`}>
        {items.map((item, i) => (
          <li key={`${i}-${item.title}`}>
            {item.image ? (
              <div className="h-16 w-16 overflow-hidden rounded-xs bg-sunken">
                <Media src={item.image.url} srcset={item.image.srcset} alt="" sizes="64px" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </div>
            ) : (
              // An icon this build does not have is a tick, not a gap.
              <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon name={hasIcon(item.icon) ? item.icon : 'check'} size={20} />
              </span>
            )}
            <h3 className="mt-5 font-sans text-[15px] font-medium">{item.title}</h3>
            {item.body.map((p, k) => (
              <p key={k} className="mt-2 text-[14px] leading-relaxed text-muted">{p}</p>
            ))}
            {item.to && (
              <To to={item.to} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink transition-colors hover:text-accent">
                {item.label || t('Learn more')} <Arrow size={14} />
              </To>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── testimonials ──────────────────────────────────────────────────────── */

/**
 * Quote cards. A row that scrolls sideways below a laptop, where three cards side by side would each be a narrow
 * column of text, and a grid of up to three per row from there.
 */
export function Testimonials({ section }) {
  const items = testimonialsOf(section.items)
  if (!items.length) return null
  return (
    <section data-home-section="testimonials" className="wrap py-16 md:py-20">
      <Intro section={section} />
      {/* Focusable, so the row scrolls from the keyboard too; the cards themselves may have nothing to focus.
          Relative, so what is positioned inside a card (the rating's screen-reader text) is clipped by the row
          instead of widening the page on a phone. */}
      <div
        role="region"
        aria-label={section.title || t('Reviews')}
        tabIndex={0}
        className="no-scrollbar relative -mx-5 snap-x snap-mandatory scroll-px-5 overflow-x-auto px-5 pb-2 md:-mx-8 md:scroll-px-8 md:px-8 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        <ul className={`flex gap-4 lg:grid lg:gap-5 ${testimonialsGrid(items.length)}`}>
          {items.map((item, i) => (
            <li key={`${i}-${item.author}`} className="w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-auto">
              <figure className="flex h-full flex-col rounded-xs border border-line bg-surface p-6">
                {item.rating && <Rating value={item.rating} size={14} showCount={false} className="mb-4" />}
                <blockquote>
                  {item.quote.map((p, k) => (
                    <p key={k} className="mt-3 text-[15px] leading-relaxed text-ink first:mt-0">{p}</p>
                  ))}
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-3 pt-6">
                  {item.image && (
                    <Media
                      src={item.image.url}
                      srcset={item.image.srcset}
                      alt=""
                      sizes="40px"
                      loading="lazy"
                      decoding="async"
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.author}</span>
                    {item.detail && <span className="block text-[12px] text-faint">{item.detail}</span>}
                  </span>
                </figcaption>
                {item.product && (
                  <Link
                    to={`/product/${item.product.slug}`}
                    className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    <span className="truncate">{item.product.title}</span> <Arrow size={14} />
                  </Link>
                )}
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ── logo-bar ──────────────────────────────────────────────────────────── */

/** Brands carried, or press that wrote about the store. Sideways on a phone, wrapped in even rows from a tablet. */
export function LogoBar({ section }) {
  const items = logosOf(section.items)
  if (!items.length) return null
  const row = logoRow(items.length)
  return (
    <section data-home-section="logo-bar" className="wrap py-12 md:py-16">
      <Intro section={section} />
      <div
        role="region"
        aria-label={section.title || t('Brands')}
        tabIndex={0}
        className="no-scrollbar relative -mx-5 overflow-x-auto px-5 md:mx-0 md:overflow-visible md:px-0"
      >
        <ul className="flex items-center gap-10 md:flex-wrap md:justify-center md:gap-x-0 md:gap-y-8">
          {items.map((item, i) => {
            const logo = item.image ? (
              <Media
                src={item.image.url}
                srcset={item.image.srcset}
                alt={item.image.alt || item.name}
                sizes="144px"
                loading="lazy"
                decoding="async"
                className="h-auto max-h-10 w-auto max-w-[9rem] object-contain"
              />
            ) : (
              <span className="whitespace-nowrap text-[13px] font-medium uppercase tracking-[0.2em] text-muted">{item.name}</span>
            )
            return (
              <li key={`${i}-${item.name}`} className={`flex shrink-0 justify-center md:px-4 ${row}`}>
                {item.to ? (
                  <To to={item.to} className="inline-flex items-center opacity-80 transition-opacity hover:opacity-100">{logo}</To>
                ) : (
                  <span className="inline-flex items-center opacity-80">{logo}</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ── faq ───────────────────────────────────────────────────────────────── */

/** Questions that open in place: native <details>, so they work before the page hydrates and with any keyboard. */
export function Faq({ section }) {
  const items = faqOf(section.items)
  if (!items.length) return null
  const body = paragraphs(section.body)
  return (
    <section data-home-section="faq" className="wrap max-w-3xl py-16 md:py-20">
      {(section.eyebrow || section.title || body.length > 0) && (
        <div className="mb-10 text-center">
          {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
          {section.title && <h2 className={`text-display-md ${section.eyebrow ? 'mt-3' : ''}`}>{section.title}</h2>}
          {body.map((p, i) => (
            <p key={i} className="mt-4 text-[16px] leading-relaxed text-muted">{p}</p>
          ))}
        </div>
      )}
      <div className="divide-y divide-line border-y border-line">
        {items.map((item, i) => (
          <details key={`${i}-${item.question}`} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <Icon name="plus" size={18} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-45" />
            </summary>
            <div className="pb-6 pe-10">
              {item.answer.map((p, k) => (
                <p key={k} className="mt-3 text-[15px] leading-relaxed text-muted first:mt-0">{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
      {section.ctaTo && (
        <p className="mt-8 text-center">
          <To to={section.ctaTo} className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
            {section.ctaLabel || t('More questions')} <Arrow />
          </To>
        </p>
      )}
    </section>
  )
}

/* ── newsletter ────────────────────────────────────────────────────────── */

/** The footer's sign-up, as a band of its own: the same call, captcha and messages (hooks/useNewsletter.js). */
export function Newsletter({ section }) {
  const config = useStorefront()
  const id = useId()
  const form = useNewsletter('home')
  // A store that switched its newsletter off has no sign-up anywhere, this one included.
  if (config.features?.newsletter === false) return null
  const body = paragraphs(section.body)
  return (
    <section data-home-section="newsletter" className="border-y border-line bg-surface">
      <div className="wrap grid items-center gap-8 py-14 md:grid-cols-2 md:gap-12 md:py-16">
        <div>
          {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
          <h2 className={`text-display-md ${section.eyebrow ? 'mt-3' : ''}`}>{section.title || t('Newsletter')}</h2>
          {body.map((p, i) => (
            <p key={i} className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">{p}</p>
          ))}
        </div>
        <form onSubmit={form.submit} className="w-full md:max-w-md md:justify-self-end">
          <label htmlFor={id} className="sr-only">{t('Email address')}</label>
          <div className="flex gap-2">
            <input
              id={id}
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => form.setEmail(e.target.value)}
              onFocus={form.captcha.activate}
              placeholder={section.placeholder || 'you@example.com'}
              className="field"
            />
            <Button type="submit" as="button" disabled={form.busy} className="shrink-0">
              {form.busy ? '…' : t('Join')}
            </Button>
          </div>
          {form.captcha.widget && <div className="mt-3">{form.captcha.widget}</div>}
        </form>
      </div>
    </section>
  )
}

/* ── featured-product ──────────────────────────────────────────────────── */

/** One product, large: its photo on one side, what it is and what it costs on the other. */
export function FeaturedProduct({ section }) {
  const product = featuredProductOf(section.product)
  if (!product) return null
  const to = `/product/${product.slug}`
  const body = paragraphs(section.body)
  const title = section.title || product.title
  return (
    <section data-home-section="featured-product" className="wrap py-16 md:py-20">
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12 lg:gap-20">
        {/* The button below is the link for the keyboard and screen readers; the photo is one more place to click. */}
        <Link to={to} tabIndex={-1} aria-hidden="true" className="group block">
          <div className="shot rounded-xs">
            {product.image && (
              <Media
                src={product.image.url}
                srcset={product.image.srcset}
                alt=""
                sizes={SIZES.hero}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            )}
          </div>
        </Link>
        <div>
          {section.eyebrow && <p className="eyebrow">{section.eyebrow}</p>}
          <h2 className={`text-display-md ${section.eyebrow ? 'mt-3' : ''}`}>{title}</h2>
          {product.brand && <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{product.brand}</p>}
          {/* A section titled "Our coat of the season" still says which coat. */}
          {title !== product.title && <p className={`${product.brand ? 'mt-1' : 'mt-4'} text-[16px] font-medium`}>{product.title}</p>}
          {product.subtitle && <p className="mt-1 text-[14px] text-muted">{product.subtitle}</p>}
          {product.price && <Price price={product.price} compareAt={product.compareAtPrice} size="lg" className="mt-4 flex-wrap" />}
          {body.map((p, i) => (
            <p key={i} className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted">{p}</p>
          ))}
          <Button to={to} size="lg" className="mt-8">{section.ctaLabel || t('View product')}</Button>
        </div>
      </div>
    </section>
  )
}

/* ── countdown ─────────────────────────────────────────────────────────── */

// Headings over the numbers, lower case as keys: "Hours" is already the shop's opening hours in every catalogue.
const UNITS = [
  ['days', mark('days')],
  ['hours', mark('hours')],
  ['minutes', mark('minutes')],
  ['seconds', mark('seconds')],
]

/**
 * A promotion with the time left on it.
 *
 * The server writes the time left when it renders; the browser counts from its own clock once the page is live, and
 * the band goes when the time is up. The digits are allowed to differ from the server's while hydrating (a second or
 * more has passed by then). A changed digit rises into place, except for shoppers who asked for less motion.
 */
export function Countdown({ section }) {
  const [now, setNow] = useState(() => Date.now())
  const left = timeLeft(section.endsAt, now)
  const running = Boolean(left)

  useEffect(() => {
    if (!running) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])

  if (!left) return null
  const image = imageOf(section.image)
  const body = paragraphs(section.body)
  return (
    <section data-home-section="countdown" className="relative overflow-hidden bg-ink text-page">
      {image && (
        <>
          <Media src={image.url} srcset={image.srcset} alt="" sizes={SIZES.full} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-ink/65" />
        </>
      )}
      <div className="wrap relative grid items-center gap-8 py-14 md:py-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-16">
        <div>
          {section.eyebrow && <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-page/75">{section.eyebrow}</p>}
          {section.title && <h2 className={`max-w-2xl text-display-md text-page ${section.eyebrow ? 'mt-3' : ''}`}>{section.title}</h2>}
          {body.map((p, i) => (
            <p key={i} className="mt-4 max-w-lg text-[15px] leading-relaxed text-page/85">{p}</p>
          ))}
          <Actions actions={actionsOf(section.actions, 2)} dark className="mt-7" />
        </div>
        {/* A timer is not a live region: a screen reader reads it when asked, not every second. */}
        <div role="timer" className="flex gap-3 sm:gap-4">
          {UNITS.map(([key, label]) => (
            <div key={key} className="min-w-[4.25rem] flex-1 rounded-xs border border-page/20 bg-page/10 px-2 py-3 text-center sm:min-w-[5.5rem] sm:flex-none sm:px-3 sm:py-4">
              <span key={left[key]} suppressHydrationWarning className="block font-display text-[1.75rem] leading-none tabular-nums motion-safe:animate-fade-up sm:text-[2.5rem]">
                {pad(left[key])}
              </span>
              <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.16em] text-page/75">{t(label)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
