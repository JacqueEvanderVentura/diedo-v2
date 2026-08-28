/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        desk: '1100px',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          light: '#eff6ff',
          accent: '#3b82f6',
        },
      },
      boxShadow: {
        cart: '-4px 0 24px rgba(15,23,42,0.03)',
        soft: '0 2px 12px rgba(15,23,42,0.04)',
      },
      keyframes: {
        'view-enter': {
          '0%': { opacity: '0', transform: 'translate3d(0, 6px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        'tab-enter': {
          '0%': { opacity: '0', transform: 'translate3d(0, 4px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'view-enter': 'view-enter 0.26s cubic-bezier(0.45, 0, 0.55, 1) both',
        'tab-enter': 'tab-enter 0.2s cubic-bezier(0.45, 0, 0.55, 1) both',
      },
    },
  },
  plugins: [],
}
