import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../ui/index.jsx'
import { site } from '../../data/site.js'
import { useCart } from '../../store/CartContext.jsx'
import { useWishlist } from '../../store/WishlistContext.jsx'
import { useAuth } from '../../store/AuthContext.jsx'

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
      {/* The demo needs to say it is a demo. On a real store this strip is where
          shipping or promo messaging goes. */}
      <div className="bg-ink text-page">
        <div className="wrap flex h-9 items-center justify-center gap-2 text-center font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="hidden sm:inline">Free shipping over $150</span>
          <span className="hidden sm:inline text-page/40">·</span>
          <span>Demo store — no real orders are placed</span>
        </div>
      </div>

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

          <Link to="/" className="font-display text-xl tracking-tight lg:text-2xl" aria-label={`${site.name} home`}>
            {site.name}
          </Link>

          <nav className="ml-8 hidden items-center gap-6 lg:flex" aria-label="Main">
            {site.nav.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `text-sm transition-colors hover:text-accent ${isActive ? 'text-accent' : 'text-ink'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-0.5">
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

            <button type="button" onClick={() => setSearchOpen((v) => !v)} aria-label="Search" className={`${iconBtn} md:hidden`}>
              <Icon name="search" size={19} />
            </button>

            <Link to="/wishlist" aria-label={`Saved items (${savedCount})`} className={iconBtn}>
              <Icon name="heart" size={19} />
              {savedCount > 0 && <Dot>{savedCount}</Dot>}
            </Link>

            <Link to={signedIn ? '/account' : '/login'} aria-label={signedIn ? 'Your account' : 'Sign in'} className={`${iconBtn} hidden sm:grid`}>
              <Icon name="user" size={19} />
            </Link>

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
        className={`fixed left-0 top-0 z-50 h-[100dvh] w-[min(84vw,20rem)] bg-page shadow-panel transition-transform lg:hidden ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="font-display text-xl">{site.name}</span>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="text-muted hover:text-ink">
            <Icon name="close" size={20} />
          </button>
        </div>
        <ul className="px-5 py-3">
          {site.nav.map((item) => (
            <li key={item.label}>
              <Link to={item.to} className="block border-b border-line py-3.5 text-[15px]">
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link to={signedIn ? '/account' : '/login'} className="block py-3.5 text-[15px] text-muted">
              {signedIn ? 'Your account' : 'Sign in'}
            </Link>
          </li>
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
