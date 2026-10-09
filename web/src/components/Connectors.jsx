import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Server, Sparkles, CloudOff } from 'lucide-react';
import { realtime } from '../lib/realtime';
import { get } from '../lib/api';
import { useUI } from '../store';

/**
 * نوار وضعیت اتصال — نمایش وضعیت شبکه، سرور و هوش مصنوعی.
 * در حالت آفلاین پیام مناسب نمایش می‌دهد (کاربردی برای اپ موبایل/دسکتاپ).
 */
export default function Connectors() {
  const [online, setOnline] = useState(navigator.onLine);
  const [socket, setSocket] = useState(false);
  const [ai, setAi] = useState(null);
  const [hidden, setHidden] = useState(false);
  const toast = useUI((s) => s.toast);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      toast('اتصال اینترنت برقرار شد.', 'success');
    };
    const down = () => {
      setOnline(false);
      toast('اتصال اینترنت قطع شد. تغییرات پس از اتصال همگام‌سازی می‌شوند.', 'error');
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    const off = realtime.on((msg) => {
      if (msg.type === 'socket:open') setSocket(true);
      if (msg.type === 'socket:close' || msg.type === 'socket:error') setSocket(false);
    });
    realtime.connect();
    get('/ai/health')
      .then((d) => setAi(d))
      .catch(() => setAi(null));
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      off();
    };
  }, [toast]);

  if (hidden) return null;

  const aiReady = ai?.configured?.filter((p) => p !== 'builtin').length > 0;
  const showBar = !online || (!socket && navigator.onLine === true);

  if (!showBar && aiReady) return null;

  return (
    <div className="border-b border-white/5 bg-ink-850/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          {online ? <Wifi className="h-3 w-3 text-emerald-400" /> : <WifiOff className="h-3 w-3 text-rose-400" />}
          {online ? 'اینترنت متصل' : <span className="text-rose-300">آفلاین — حالت خواندنی</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <Server className={socket ? 'h-3 w-3 text-emerald-400' : 'h-3 w-3 text-slate-500'} />
          {socket ? 'اتصال زنده فعال' : 'اتصال زنده در حال برقراری'}
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className={aiReady ? 'h-3 w-3 text-brand-400' : 'h-3 w-3 text-slate-500'} />
          {aiReady ? 'هوش مصنوعی ابری متصل' : 'موتور داخلی هوش مصنوعی'}
        </span>
        <button onClick={() => setHidden(true)} className="mr-auto text-slate-600 hover:text-slate-400">
          بستن ×
        </button>
      </div>
    </div>
  );
}
