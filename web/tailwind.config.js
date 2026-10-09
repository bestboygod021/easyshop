/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', 'IRANSans', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
          500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
        },
        ink: {
          900: '#080c1a', 850: '#0b1020', 800: '#0f1729', 700: '#151d33', 600: '#1e2942', 500: '#2a3750',
        },
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(99,102,241,.55)',
        card: '0 10px 30px -12px rgba(2,6,23,.55)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { '100%': { transform: 'translateX(-100%)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: .55 } },
      },
      animation: {
        float: 'float 4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        pulseSoft: 'pulseSoft 1.8s ease-in-out infinite',
      },
      screens: { xs: '420px' },
    },
  },
  plugins: [],
};
