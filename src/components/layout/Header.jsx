import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../ui/index.jsx'
import { useCart } from '../../store/CartContext.jsx'
import { useWishlist } from '../../store/WishlistContext.jsx'
import { useAuth } from '../../store/AuthContext.jsx'
import { useStorefront, useBootstrap } from '../../store/StorefrontContext.jsx'
import Logo from '../ui/Logo.jsx'
import useAsync from '../../hooks/useAsync.js'
import api from '../../lib/api/index.js'
import { docsLinkVisible } from '../../lib/docs-link.js'
import useFocusTrap from '../../hooks/useFocusTrap.js'

// Submenu entries are categories ({ slug, name }) or links the merchant added
// by hand ({ label, to }).
const subTo = (c) => c.to || `/shop/${c.slug}`
const subKey = (c) => c.slug || c.to

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const searchRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { count, setOpen } = useCart()
  const { count: savedCount } = useWishlist()
  const { signedIn } = useAuth()
  const config = useStorefront()
  const { categories: booted } = useBootstrap()
  const { data: fetched } = useAsync(() => api.listCategories(), [], { skip: !!booted })
  const cats = booted ? { items: booted } : fetched
  const [openMenu, setOpenMenu] = useState(null)
  const menuRef = useFocusTrap(menuOpen)
  const messages = config.navigation?.announcement?.messages || []
  const [tick, setTick] = useState(0)

  // One announcement at a time, each for a few seconds. Still when motion is reduced or there is only one.
  useEffect(() => {
    if (messages.length < 2) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(timer)
  }, [messages.length])

  const features = config.features || {}
  // A nav entry with `categorySlug` pulls that category's children in as a
  // submenu, so the menu never has to restate the category tree.
  const primary = (config.navigation?.primary?.length
    ? config.navigation.primary
    : (cats?.items || []).map((c) => ({ label: c.name, categorySlug: c.slug }))
  ).map((item) => {
    const cat = item.categorySlug ? cats?.items.find((c) => c.slug === item.categorySlug) : null
    return {
      ...item,
      to: item.to || (cat ? `/shop/${cat.slug}` : '/shop'),
      children: item.children || cat?.children || [],
    }
  })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const submit = (e) => {
    e.preventDefault()
    if (!q.trim()) return
    navigate(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  const iconBtn =
    'relative grid h-10 w-10 place-items-center rounded-xs text-ink transition-colors hover:bg-sunken'

  return (
    <>
      {/* Shipping, promotions or opening hours, written in the backend (with start and end dates). */}
      {messages.length > 0 && (
        <div className="bg-ink text-page">
          <div className="wrap flex h-9 items-center justify-center text-center font-mono text-[10px] uppercase tracking-[0.16em]">
            <span key={tick % messages.length} className="animate-fade-up">{messages[tick % messages.length]}</span>
          </div>
        </div>
      )}

      <header
        className={`sticky top-0 z-30 border-b bg-page/90 backdrop-blur transition-shadow ${scrolled ? 'border-line shadow-[0_1px_0_rgb(var(--line))]' : 'border-transparent'}`}
      >
        <div className="wrap flex h-16 items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className={`${iconBtn} lg:hidden`}
          >
            <Icon name="menu" size={20} />
          </button>

          <Link to="/" aria-label={`${config.store?.name} home`}>
            <Logo config={config} />
          </Link>

          <nav className="ml-8 hidden items-center gap-1 lg:flex" aria-label="Main">
            {primary.map((item) => (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setOpenMenu(item.label)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1 rounded-xs px-3 py-2 text-sm transition-colors hover:text-accent ${isActive ? 'text-accent' : 'text-ink'}`
                  }
                >
                  {item.label}
                  {item.children.length > 0 && <Icon name="chevron-down" size={13} className="text-faint" />}
                </NavLink>

                {item.children.length > 0 && openMenu === item.label && (
                  <div className="absolute left-0 top-full w-56 pt-1">
                    <ul className="rounded-xs border border-line bg-surface p-1.5 shadow-card">
                      <li>
                        <Link to={item.to} className="block rounded-xs px-3 py-2 text-[13px] font-medium hover:bg-sunken">
                          All {item.label.toLowerCase()}
                        </Link>
                      </li>
                      {item.children.map((c) => (
                        <li key={subKey(c)}>
                          <Link to={subTo(c)} className="flex items-baseline justify-between rounded-xs px-3 py-2 text-[13px] text-muted hover:bg-sunken hover:text-ink">
                            {c.name || c.label}
                            <span className="text-[11px] text-faint tabular-nums">{c.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-0.5">
            {features.search !== false && (
            <form onSubmit={submit} className="hidden items-center md:flex">
              <label className="sr-only" htmlFor="site-search">Search products</label>
              <div className="relative">
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  id="site-search"
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search"
                  className="field h-10 w-44 pl-9 transition-[width] focus:w-64"
                />
              </div>
            </form>
            )}

            {features.search !== false && (
              <button type="button" onClick={() => setSearchOpen((v) => !v)} aria-label="Search" className={`${iconBtn} md:hidden`}>
                <Icon name="search" size={19} />
              </button>
            )}

            {features.wishlist !== false && (
              <Link to="/wishlist" aria-label={`Saved items (${savedCount})`} className={iconBtn}>
                <Icon name="heart" size={19} />
                {savedCount > 0 && <Dot>{savedCount}</Dot>}
              </Link>
            )}

            {/*
              Visible at every width. It was `hidden sm:grid`, which left a
              phone with no way to reach an order, an address or a sign-out
              except through the hamburger — and nobody opens a navigation
              drawer looking for their account. The bag and the saved items are
              both there at every width; the account is the same kind of thing.
            */}
            {features.accounts !== false && (
              <Link
                to={signedIn ? '/account' : '/login'}
                aria-label={signedIn ? 'Your account' : 'Sign in'}
                className={iconBtn}
              >
                <Icon name="user" size={19} />
                {/* Signed-in state has to be legible without opening the page,
                    or the only way to find out is to tap and see. */}
                {signedIn && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-good ring-2 ring-page"
                  />
                )}
              </Link>
            )}

            <button type="button" onClick={() => setOpen(true)} aria-label={`Your bag (${count})`} className={iconBtn}>
              <Icon name="bag" size={19} />
              {count > 0 && <Dot>{count}</Dot>}
            </button>
          </div>
        </div>

        {searchOpen && (
          <form onSubmit={submit} className="wrap pb-3 md:hidden">
            <div className="relative">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products"
                className="field pl-9"
              />
            </div>
          </form>
        )}
      </header>

      {/* mobile drawer */}
      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-ink/35 transition-opacity lg:hidden ${menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <nav
        aria-label="Mobile"
        ref={menuRef}
        tabIndex={-1}
        {...(menuOpen ? {} : { inert: '' })}
        className={`fixed left-0 top-0 z-50 h-[100dvh] w-[min(84vw,20rem)] bg-page shadow-panel transition-transform lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Logo config={config} size={20} />
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="text-muted hover:text-ink">
            <Icon name="close" size={20} />
          </button>
        </div>
        <ul className="max-h-[calc(100dvh-8rem)] overflow-y-auto px-5 py-3">
          {primary.map((item) => (
            <li key={item.label} className="border-b border-line py-1">
              <Link to={item.to} className="block py-3 text-[15px]">{item.label}</Link>
              {item.children.length > 0 && (
                <ul className="pb-2 pl-3">
                  {item.children.map((c) => (
                    <li key={subKey(c)}>
                      <Link to={subTo(c)} className="block py-2 text-[13px] text-muted">{c.name || c.label}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          <li>
            <Link to={signedIn ? '/account' : '/login'} className="block py-3.5 text-[15px] text-muted">
              {signedIn ? 'Your account' : 'Sign in'}
            </Link>
          </li>
          {/* The floating pill is desktop-only — the bottom of a phone screen
              belongs to the buy bar. This is the same door, in the drawer that
              already exists, costing no space until it is opened. */}
          {docsLinkVisible(config) && (
            <li className="border-t border-line pt-1">
              <Link to="/docs" className="flex items-center gap-2 py-3.5 text-[15px] text-muted">
                <Icon name="info" size={16} />
                Docs &amp; API
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </>
  )
}

function Dot({ children }) {
  return (
    <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-accent-ink tabular-nums">
      {children}
    </span>
  )
}
