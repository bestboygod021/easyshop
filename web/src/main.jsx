import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

/* ثبت Service Worker (PWA / نصب روی موبایل و ویندوز) */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

/* پاک کردن اسپلش اولیه */
const splash = document.getElementById('boot-splash');
if (splash) {
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 300);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
