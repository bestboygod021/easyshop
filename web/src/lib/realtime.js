/**
 * کلاینت WebSocket فروشگاه — چت زنده، اعلان لحظه‌ای و رخدادهای سفارش.
 * با اتصال مجدد خودکار و صف پیام‌های ارسالی.
 */
import { auth } from './api';

const RAW_BASE =
  (typeof window !== 'undefined' &&
    (window.EASYSHOP_API_URL || window.localStorage?.getItem('easyshop.apiBase'))) ||
  import.meta.env.VITE_API_URL ||
  '';
const WS_URL = (() => {
  if (RAW_BASE) return `${RAW_BASE.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
})();

const listeners = new Set();
let socket = null;
let reconnectTimer = null;
let attempts = 0;
let queue = [];

export const realtime = {
  connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return socket;
    try {
      socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(auth.token || '')}`);
    } catch {
      scheduleReconnect();
      return null;
    }
    socket.onopen = () => {
      attempts = 0;
      emit({ type: 'socket:open' });
      const pending = queue;
      queue = [];
      pending.forEach((msg) => this.send(msg));
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          this.send({ type: 'pong' });
          return;
        }
        emit(data);
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      emit({ type: 'socket:close' });
      scheduleReconnect();
    };
    socket.onerror = () => emit({ type: 'socket:error' });
    return socket;
  },
  send(payload) {
    const data = JSON.stringify(payload);
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(data);
    else {
      queue.push(payload);
      this.connect();
    }
  },
  on(handler) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },
  get connected() {
    return Boolean(socket && socket.readyState === WebSocket.OPEN);
  },
  close() {
    clearTimeout(reconnectTimer);
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  },
  reconnectWithNewToken() {
    this.close();
    attempts = 0;
    this.connect();
  },
};

function emit(data) {
  listeners.forEach((fn) => {
    try {
      fn(data);
    } catch (err) {
      console.warn('realtime listener error', err);
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  attempts += 1;
  const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts, 4));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    realtime.connect();
  }, delay);
}

export default realtime;
