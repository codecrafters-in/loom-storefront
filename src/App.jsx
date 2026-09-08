import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import { ToastProvider } from './store/ToastContext.jsx'
import { CartProvider } from './store/CartContext.jsx'
import { WishlistProvider } from './store/WishlistContext.jsx'
import { AuthProvider } from './store/AuthContext.jsx'
import { StorefrontProvider } from './store/StorefrontContext.jsx'
import { AdminAuthProvider } from './store/AdminAuthContext.jsx'
import RequireAdmin from './components/admin/RequireAdmin.jsx'
import Home from './pages/Home.jsx'
import Shop from './pages/Shop.jsx'
import Product from './pages/Product.jsx'
import { Skeleton } from './components/ui/index.jsx'

// Split the routes a browsing visitor never reaches. Checkout and account are
// the biggest of these and the least visited, which is exactly the trade
// code-splitting is for.
const Cart = lazy(() => import('./pages/Cart.jsx'))
const Wishlist = lazy(() => import('./pages/Wishlist.jsx'))
const Checkout = lazy(() => import('./pages/Checkout.jsx'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation.jsx'))
const Account = lazy(() => import('./pages/Account.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const Search = lazy(() => import('./pages/Search.jsx'))
const StaticPage = lazy(() => import('./pages/StaticPage.jsx'))
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
const AdminDocs = lazy(() => import('./pages/admin/Docs.jsx'))
const AdminLogin = lazy(() => import('./pages/admin/Login.jsx'))

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
                  <Route path="login" element={<Login />} />
                  <Route path="account/*" element={<Account />} />
                  <Route path="pages/:slug" element={<StaticPage />} />
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
                  <Route path="docs" element={<AdminDocs />} />
                  <Route path="docs/:page" element={<AdminDocs />} />
                </Route>
              </Routes>
            </Suspense>
          </CartProvider>
        </WishlistProvider>
        </AuthProvider>
        </AdminAuthProvider>
      </StorefrontProvider>
    </ToastProvider>
  )
}
