import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import Layout from './components/Layout';
import AccountLayout from './pages/account/AccountLayout';
import AdminLayout from './pages/admin/AdminLayout';
import { Toasts } from './components/ui';
import { useAuth, useSettings } from './store';

/* ----------------------------- صفحات فروشگاه ----------------------------- */
const Home = lazy(() => import('./pages/Home'));
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Categories = lazy(() => import('./pages/Categories'));
const Category = lazy(() => import('./pages/Category'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PaymentResult = lazy(() => import('./pages/PaymentResult'));
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ResetPassword })));
const Support = lazy(() => import('./pages/Support'));
const About = lazy(() => import('./pages/About'));
const NotFound = lazy(() => import('./pages/NotFound'));

/* ------------------------------ پنل کاربری ------------------------------- */
const AccountDashboard = lazy(() => import('./pages/account/Dashboard'));
const AccountOrders = lazy(() => import('./pages/account/Orders'));
const AccountOrderDetail = lazy(() => import('./pages/account/OrderDetail'));
const AccountWishlist = lazy(() => import('./pages/account/Wishlist'));
const AccountWallet = lazy(() => import('./pages/account/Wallet'));
const AccountProfile = lazy(() => import('./pages/account/Profile'));
const AccountAddresses = lazy(() => import('./pages/account/Addresses'));
const AccountTickets = lazy(() => import('./pages/account/Tickets'));
const AccountTicketDetail = lazy(() => import('./pages/account/TicketDetail'));
const AccountNotifications = lazy(() => import('./pages/account/Notifications'));

/* ------------------------------ پنل مدیریت ------------------------------- */
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminOrders = lazy(() => import('./pages/admin/Orders'));
const AdminOrderDetail = lazy(() => import('./pages/admin/OrderDetail'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const AdminProductForm = lazy(() => import('./pages/admin/ProductForm'));
const AdminCategories = lazy(() => import('./pages/admin/Categories'));
const AdminInventory = lazy(() => import('./pages/admin/Inventory'));
const AdminCoupons = lazy(() => import('./pages/admin/Coupons'));
const AdminCustomers = lazy(() => import('./pages/admin/Customers'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const AdminTickets = lazy(() => import('./pages/admin/Tickets'));
const AdminTicketDetail = lazy(() => import('./pages/admin/TicketDetail'));
const AdminChat = lazy(() => import('./pages/admin/ChatInbox'));
const AdminAiStudio = lazy(() => import('./pages/admin/AiStudio'));
const AdminAiProviders = lazy(() => import('./pages/admin/AiProviders'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminLogs = lazy(() => import('./pages/admin/Logs'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function Splash() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Boxes className="h-7 w-7" />
        </span>
        <span className="text-xs text-slate-500">در حال بارگذاری…</span>
      </div>
    </div>
  );
}

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap);
  const loadSettings = useSettings((s) => s.load);

  useEffect(() => {
    bootstrap();
    loadSettings?.().catch(() => {});
  }, [bootstrap, loadSettings]);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:slug" element={<ProductDetail />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/categories/:slug" element={<Category />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/payment/result" element={<PaymentResult />} />
            <Route path="/support" element={<Support />} />
            <Route path="/about" element={<About />} />

            <Route path="/account" element={<AccountLayout />}>
              <Route index element={<AccountDashboard />} />
              <Route path="orders" element={<AccountOrders />} />
              <Route path="orders/:id" element={<AccountOrderDetail />} />
              <Route path="wishlist" element={<AccountWishlist />} />
              <Route path="wallet" element={<AccountWallet />} />
              <Route path="profile" element={<AccountProfile />} />
              <Route path="addresses" element={<AccountAddresses />} />
              <Route path="tickets" element={<AccountTickets />} />
              <Route path="tickets/:id" element={<AccountTicketDetail />} />
              <Route path="notifications" element={<AccountNotifications />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>

          {/* صفحات احراز هویت خارج از چیدمان اصلی */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/login" element={<Navigate to="/login" replace />} />

          {/* پنل مدیریت */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="products/new" element={<AdminProductForm />} />
            <Route path="products/:id" element={<AdminProductForm />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="tickets" element={<AdminTickets />} />
            <Route path="tickets/:id" element={<AdminTicketDetail />} />
            <Route path="chat" element={<AdminChat />} />
            <Route path="ai-studio" element={<AdminAiStudio />} />
            <Route path="ai-providers" element={<AdminAiProviders />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="logs" element={<AdminLogs />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Routes>
      </Suspense>
      <Toasts />
    </BrowserRouter>
  );
}
