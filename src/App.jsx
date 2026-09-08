import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout.jsx'
import { ToastProvider } from './store/ToastContext.jsx'
import { CartProvider } from './store/CartContext.jsx'
import { WishlistProvider } from './store/WishlistContext.jsx'
import { AuthProvider } from './store/AuthContext.jsx'
import { StorefrontProvider } from './store/StorefrontContext.jsx'
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

const Loading = () => (
  <div className="wrap py-20">
    <Skeleton className="h-96 w-full" />
  </div>
)

export default function App() {
  return (
    <ToastProvider>
      <StorefrontProvider>
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
              </Routes>
            </Suspense>
          </CartProvider>
        </WishlistProvider>
        </AuthProvider>
      </StorefrontProvider>
    </ToastProvider>
  )
}
