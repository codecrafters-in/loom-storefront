import { NavLink, Outlet, Link } from 'react-router-dom'
import { Icon } from '../../components/ui/index.jsx'
import { LoomMark } from '../../components/ui/Logo.jsx'
import { useStorefront } from '../../store/StorefrontContext.jsx'
import { isMock } from '../../lib/api/index.js'
import { useAdminAuth } from '../../store/AdminAuthContext.jsx'

/**
 * The admin shell.
 *
 * Deliberately spare. This is a reference implementation of the write API, not
 * a product — it exists so a merchant can run the demo end to end, and so that
 * every write endpoint in the documentation has something proving it works.
 *
 * It talks to the same `api` surface the storefront uses. In mock mode that is
 * the local database, so an edit here is visible on the shop immediately; in
 * api mode it is your `/admin/*` endpoints, unchanged.
 */
const NAV = [
  { to: '/admin', end: true, label: 'Overview', icon: 'sparkle' },
  { to: '/admin/products', label: 'Products', icon: 'package' },
  { to: '/admin/inventory', label: 'Inventory', icon: 'filter' },
  { to: '/admin/categories', label: 'Categories', icon: 'map-pin' },
  { to: '/admin/size-charts', label: 'Size charts', icon: 'filter' },
  { to: '/admin/orders', label: 'Orders', icon: 'truck' },
  { to: '/admin/discounts', label: 'Discounts', icon: 'sparkle' },
  { to: '/admin/storefront', label: 'Storefront', icon: 'star' },
  { to: '/admin/data', label: 'Import / export', icon: 'refresh' },
  { to: '/docs', label: 'Developer docs', icon: 'info' },
]

export default function AdminLayout() {
  const config = useStorefront()
  const { session, signOut } = useAdminAuth()
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-4 px-5">
          <Link to="/admin" className="flex items-center gap-2.5">
            <LoomMark size={22} />
            <span className="font-display text-[15px]">{config.store?.name} admin</span>
          </Link>
          <span className="rounded-xs bg-sunken px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {isMock ? 'local data' : 'live api'}
          </span>
          <div className="ml-auto flex items-center gap-4">
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink">
              View store <Icon name="arrow-right" size={14} />
            </Link>
            <span className="hidden text-[13px] text-faint sm:inline">{session?.username}</span>
            <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-sale">
              <Icon name="log-out" size={15} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-8 px-5 py-8">
        <nav aria-label="Admin" className="hidden w-52 shrink-0 lg:block">
          <ul className="sticky top-8 space-y-0.5">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xs px-3 py-2.5 text-[14px] transition-colors ${
                      isActive ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'
                    }`
                  }
                >
                  <Icon name={n.icon} size={16} />
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {/* Mobile nav — a horizontal scroller rather than a hamburger, because
              an admin on a phone is usually doing one quick thing. */}
          <ul className="no-scrollbar mb-6 flex gap-2 overflow-x-auto lg:hidden">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `inline-flex whitespace-nowrap rounded-xs border px-3 py-2 text-[13px] ${
                      isActive ? 'border-ink bg-ink text-page' : 'border-line text-muted'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <Outlet />
        </div>
      </div>
    </div>
  )
}
