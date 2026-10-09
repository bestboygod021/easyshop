import { Link } from 'react-router-dom';
import { Home, Search, ShoppingBag } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-6xl font-black text-brand-500/40">۴۰۴</p>
      <h1 className="mt-4 text-lg font-extrabold text-white">صفحه‌ای که دنبالش بودید پیدا نشد</h1>
      <p className="mt-2 text-xs leading-6 text-slate-500">
        ممکن است آدرس تغییر کرده باشد یا محصول حذف شده باشد. می‌توانید از فروشگاه یا جستجو استفاده کنید.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-primary">
          <Home className="h-4 w-4" /> صفحه اصلی
        </Link>
        <Link to="/products" className="btn-ghost">
          <ShoppingBag className="h-4 w-4" /> فروشگاه
        </Link>
      </div>
    </div>
  );
}
