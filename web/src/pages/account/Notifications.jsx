import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Package, Ticket, Wallet, Sparkles } from 'lucide-react';
import { get, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { EmptyState, Loading, Badge } from '../../components/ui';
import { useNotifications, toast } from '../../store';

const ICONS = { order: Package, ticket: Ticket, wallet: Wallet, promo: Sparkles, admin: Bell, welcome: Sparkles, inventory: Package };

export default function Notifications() {
  const [items, setItems] = useState(null);
  const { markAllRead, load } = useNotifications();

  const fetchItems = () => get('/account/notifications').then((d) => setItems(d.items)).catch(() => setItems([]));

  useEffect(() => {
    fetchItems();
  }, []);

  const readAll = async () => {
    await markAllRead();
    await load();
    fetchItems();
    toast('همه اعلان‌ها خوانده شد.', 'info');
  };

  const readOne = async (id) => {
    await post('/account/notifications/read', { id });
    fetchItems();
    load();
  };

  if (!items) return <Loading />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-extrabold text-white">
            <Bell className="h-5 w-5 text-brand-400" /> اعلان‌ها
          </h1>
          <p className="mt-1 text-xs text-slate-500">وضعیت سفارش‌ها، پاسخ تیکت‌ها و پیشنهادهای ویژه</p>
        </div>
        <button onClick={readAll} className="btn-ghost btn-sm">
          <CheckCheck className="h-3.5 w-3.5" /> خواندن همه
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyState title="اعلانی وجود ندارد" description="اعلان‌های مربوط به سفارش و تیکت‌ها اینجا نمایش داده می‌شوند." icon={Bell} />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <div key={n.id} className={`card flex items-start gap-3 p-4 ${!n.is_read ? 'border-brand-500/30 bg-brand-500/5' : ''}`}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
                  <Icon className="h-4 w-4 text-brand-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-xs font-bold text-slate-100">
                    {n.title}
                    {!n.is_read ? <Badge color="rose">جدید</Badge> : null}
                  </p>
                  <p className="mt-1 text-[11px] leading-6 text-slate-400">{n.body}</p>
                  <p className="mt-1 text-[10px] text-slate-600">{timeAgo(n.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  {n.link ? (
                    <Link to={n.link} onClick={() => readOne(n.id)} className="btn-ghost btn-sm">
                      مشاهده
                    </Link>
                  ) : null}
                  {!n.is_read ? (
                    <button onClick={() => readOne(n.id)} className="text-[10px] text-slate-500 hover:text-slate-300">
                      علامت‌گذاری خوانده‌شده
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
