import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import { ToastProvider } from './store/ToastContext.jsx'
import { CartProvider } from './store/CartContext.jsx'
import { WishlistProvider } from './store/WishlistContext.jsx'
import { AuthProvider } from './store/AuthContext.jsx'
import { StorefrontProvider } from './store/StorefrontContext.jsx'
import { AdminAuthProvider } from './store/AdminAuthContext.jsx'
import RequireAdmin from './components/admin/RequireAdmin.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Home from './pages/Home.jsx'
import Shop from './pages/Shop.jsx'
import Product from './pages/Product.jsx'
// Eager, because it is prerendered and in the sitemap: a lazy component renders
// its Suspense fallback during a server render, so an indexed route that is
// code-split ships a skeleton to the crawler.
import StaticPage from './pages/StaticPage.jsx'
import Docs from './pages/Docs.jsx'
import { Skeleton } from './components/ui/index.jsx'

// Split the routes a browsing visitor never reaches. Checkout and account are
// the biggest of these and the least visited, which is exactly the trade
// code-splitting is for.
const Cart = lazy(() => import('./pages/Cart.jsx'))
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'))
const Checkout = lazy(() => import('./pages/Checkout.jsx'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation.jsx'))
const OrderLookup = lazy(() => import('./pages/OrderLookup.jsx'))
const Account = lazy(() => import('./pages/Account.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Search = lazy(() => import('./pages/Search.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

// The admin panel is a separate chunk. A shopper never downloads it.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'))
const AdminOverview = lazy(() => import('./pages/admin/pages.jsx').then((m) => ({ default: m.Overview })))
const AdminProducts = lazy(() => import('./pages/admin/pages.jsx').then((m) => ({ default: m.Products })))
const AdminInventory = lazy(() => import('./pages/admin/pages.jsx').then((m) => ({ default: m.Inventory })))
const AdminCategories = lazy(() => import('./pages/admin/pages2.jsx').then((m) => ({ default: m.Categories })))
const AdminOrders = lazy(() => import('./pages/admin/pages2.jsx').then((m) => ({ default: m.Orders })))
const AdminStorefront = lazy(() => import('./pages/admin/pages2.jsx').then((m) => ({ default: m.Storefront })))
const AdminData = lazy(() => import('./pages/admin/pages2.jsx').then((m) => ({ default: m.Data })))
const AdminProductEditor = lazy(() => import('./pages/admin/ProductEditor.jsx'))
const AdminSizeCharts = lazy(() => import('./pages/admin/pages2.jsx').then((m) => ({ default: m.SizeCharts })))
const AdminDiscounts = lazy(() => import('./pages/admin/pages2.jsx').then((m) => ({ default: m.Discounts })))
const AdminLogin = lazy(() => import('./pages/admin/Login.jsx'))

/** Keyed on the path, because a boundary that never resets breaks every page
 *  after the first one. */
function Boundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

const Loading = () => (
  <div className="wrap py-20">
    <Skeleton className="h-96 w-full" />
  </div>
)

export default function App() {
  return (
    <ToastProvider>
      <StorefrontProvider>
        <AdminAuthProvider>
        <AuthProvider>
        <WishlistProvider>
          <CartProvider>
            {/* Inside the providers, so a failed route keeps the header, the
                bag and the search — somebody who hits this can carry on
                shopping, which is the difference between an incident and a
                bounce. Keyed on the path so navigating away clears it. */}
            <Boundary>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  <Route path="shop/:slug" element={<Shop mode="category" />} />
                  <Route path="collections/:slug" element={<Shop mode="collection" />} />
                  <Route path="product/:slug" element={<Product />} />
                  <Route path="search" element={<Search />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="order/:id" element={<OrderConfirmation />} />
                  <Route path="orders/lookup" element={<OrderLookup />} />
                  <Route path="login" element={<Login />} />
                  <Route path="account/*" element={<Account />} />
                  <Route path="pages/:slug" element={<StaticPage />} />
                  {/* Public and prerendered. The API reference behind a login
                      is a reference nobody reads before deciding. */}
                  <Route path="docs" element={<Docs />} />
                  <Route path="docs/:page" element={<Docs />} />
                  <Route path="404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Route>

                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                  path="/admin"
                  element={
                    <RequireAdmin>
                      <AdminLayout />
                    </RequireAdmin>
                  }
                >
                  <Route index element={<AdminOverview />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="products/:id" element={<AdminProductEditor />} />
                  <Route path="inventory" element={<AdminInventory />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="size-charts" element={<AdminSizeCharts />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="discounts" element={<AdminDiscounts />} />
                  <Route path="storefront" element={<AdminStorefront />} />
                  <Route path="data" element={<AdminData />} />
                </Route>
              </Routes>
            </Suspense>
            </Boundary>
          </CartProvider>
        </WishlistProvider>
        </AuthProvider>
        </AdminAuthProvider>
      </StorefrontProvider>
    </ToastProvider>
  )
}
