import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// در حالت توسعه، درخواست‌های /api و /ws به بک‌اند (پورت ۴۰۰۰) پروکسی می‌شوند
// تا مرورگر فقط با یک دامنه کار کند (سازگار با پیش‌نمایش‌های ابری و شبکه محلی).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': { target: process.env.API_URL || 'http://127.0.0.1:4000', changeOrigin: true },
      '/uploads': { target: process.env.API_URL || 'http://127.0.0.1:4000', changeOrigin: true },
      '/ws': { target: (process.env.API_URL || 'http://127.0.0.1:4000').replace('http', 'ws'), ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
