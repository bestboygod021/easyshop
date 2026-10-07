import { create } from 'zustand';
import { api, auth, get, post, put, del, api as _api } from '../lib/api';
import { realtime } from '../lib/realtime';

/* --------------------------------- احراز هویت ------------------------------ */
const savedUser = () => {
  try {
    return JSON.parse(localStorage.getItem('easyshop.user') || 'null');
  } catch {
    return null;
  }
};

export const useAuth = create((set, get_) => ({
  user: savedUser(),
  loading: false,
  ready: false,
  async bootstrap() {
    if (!auth.token) {
      set({ ready: true, user: null });
      return null;
    }
    try {
      const data = await get('/auth/me');
      localStorage.setItem('easyshop.user', JSON.stringify(data.user));
      set({ user: data.user, ready: true });
      return data.user;
    } catch {
      set({ user: null, ready: true });
      return null;
    }
  },
  async login(email, password) {
    set({ loading: true });
    try {
      const data = await post('/auth/login', { email, password });
      auth.set(data.session.accessToken, data.session.refreshToken);
      localStorage.setItem('easyshop.user', JSON.stringify(data.session.user));
      set({ user: data.session.user, loading: false });
      realtime.reconnectWithNewToken();
      await useCart.getState().mergeGuestCart();
      return data.session.user;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  async register(payload) {
    set({ loading: true });
    try {
      const data = await post('/auth/register', payload);
      auth.set(data.session.accessToken, data.session.refreshToken);
      localStorage.setItem('easyshop.user', JSON.stringify(data.session.user));
      set({ user: data.session.user, loading: false });
      realtime.reconnectWithNewToken();
      await useCart.getState().mergeGuestCart();
      return data.session.user;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  async update(payload) {
    const data = await put('/auth/me', payload);
    localStorage.setItem('easyshop.user', JSON.stringify(data.user));
    set({ user: data.user });
    return data.user;
  },
  async logout() {
    try {
      await post('/auth/logout', { refreshToken: auth.refreshToken });
    } catch {
      /* ignore */
    }
    auth.clear();
    realtime.close();
    set({ user: null });
    useNotifications.setState({ items: [], unread: 0 });
  },
}));

/* ---------------------------------- سبد خرید ------------------------------- */
export const useCart = create((set, get_) => ({
  items: [],
  totals: null,
  coupon: null,
  loading: false,
  openDrawer: false,
  /** پس از ورود، سبد مهمان با سبد کاربر ادغام می‌شود تا کالاها از دست نروند */
  async mergeGuestCart() {
    try {
      await post('/cart/merge', {});
    } catch {
      /* اگر سبد مهمانی وجود نداشت، بی‌صدا رد می‌شویم */
    }
    return get_().load();
  },
  async load() {
    set({ loading: true });
    try {
      const data = await get('/cart');
      set({ items: data.items, totals: data.totals, coupon: data.coupon_code, loading: false });
      return data;
    } catch {
      set({ loading: false });
      return null;
    }
  },
  async add(productId, { qty = 1, variantId = null, note } = {}) {
    const data = await post('/cart/items', { product_id: productId, qty, variant_id: variantId, note });
    set({ items: data.items, totals: data.totals, coupon: data.coupon_code, openDrawer: true });
    return data;
  },
  async updateQty(itemId, qty) {
    const data = await _api(`/cart/items/${itemId}`, { method: 'PATCH', body: { qty } });
    set({ items: data.items, totals: data.totals });
  },
  async remove(itemId) {
    const data = await _api(`/cart/items/${itemId}`, { method: 'DELETE' });
    set({ items: data.items, totals: data.totals });
  },
  async clear() {
    const data = await _api('/cart', { method: 'DELETE' });
    set({ items: data.items, totals: data.totals, coupon: null });
  },
  async applyCoupon(code) {
    const data = await post('/cart/coupon', { code });
    set({ items: data.items, totals: data.totals, coupon: data.coupon_code });
    return data;
  },
  setDrawer(open) {
    set({ openDrawer: open });
  },
  get count() {
    return get_().items.reduce((s, i) => s + i.qty, 0);
  },
}));

/* ------------------------------- علاقه‌مندی‌ها ------------------------------ */
export const useWishlist = create((set, get_) => ({
  ids: new Set(),
  items: [],
  async load() {
    if (!auth.token) {
      set({ ids: new Set(), items: [] });
      return;
    }
    try {
      const data = await get('/account/wishlist');
      set({ items: data.items, ids: new Set(data.items.map((i) => i.id)) });
    } catch {
      /* ignore */
    }
  },
  async toggle(productId) {
    if (!auth.token) throw new Error('برای افزودن به علاقه‌مندی‌ها وارد شوید.');
    const data = await post(`/account/wishlist/${productId}`);
    const ids = new Set(get_().ids);
    if (data.in_wishlist) ids.add(productId);
    else ids.delete(productId);
    set({ ids });
    await get_().load();
    return data;
  },
  has(id) {
    return get_().ids.has(id);
  },
}));

/* --------------------------------- اعلان‌ها -------------------------------- */
export const useNotifications = create((set, get_) => ({
  items: [],
  unread: 0,
  async load() {
    if (!auth.token) return;
    try {
      const data = await get('/account/notifications');
      set({ items: data.items, unread: data.unread });
    } catch {
      /* ignore */
    }
  },
  push(notification) {
    set((state) => ({ items: [notification, ...state.items].slice(0, 60), unread: state.unread + 1 }));
  },
  async markAllRead() {
    await post('/account/notifications/read', {});
    set((state) => ({ items: state.items.map((i) => ({ ...i, is_read: 1 })), unread: 0 }));
  },
}));

/* ---------------------------------- رابط کاربری ---------------------------- */
export const useUI = create((set) => ({
  theme: localStorage.getItem('easyshop.theme') || 'dark',
  locale: localStorage.getItem('easyshop.locale') || 'fa',
  toasts: [],
  chatOpen: false,
  mobileMenu: false,
  searchOpen: false,
  toggleTheme() {
    set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('easyshop.theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
      return { theme };
    });
  },
  setLocale(locale) {
    localStorage.setItem('easyshop.locale', locale);
    document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    set({ locale });
  },
  toast(message, type = 'success', duration = 3200) {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), duration);
  },
  setChatOpen(open) {
    set({ chatOpen: open });
  },
  setMobileMenu(open) {
    set({ mobileMenu: open });
  },
  setSearchOpen(open) {
    set({ searchOpen: open });
  },
}));

export const toast = (message, type) => useUI.getState().toast(message, type);

/* -------------------------------- تنظیمات سایت ----------------------------- */
export const useSettings = create((set) => ({
  store: {},
  commerce: {},
  appearance: {},
  loaded: false,
  async load() {
    try {
      const data = await get('/settings');
      set({ ...data, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
