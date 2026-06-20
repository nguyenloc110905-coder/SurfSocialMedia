/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './src/**/*.css'],
  theme: {
    extend: {
      colors: {
        surf: {
          primary: '#0ea5e9',
          secondary: '#06b6d4',
          dark: '#0f172a',
          card: '#1e293b',
          light: '#f8fafc',
          'card-light': '#ffffff',
        },
        crimson: '#e11d48',
        'crimson-dark': '#be123c',
        surface: '#1a1a1a',
      },
      keyframes: {
        'logo-drop': {
          '0%': { transform: 'translateY(-120%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'cta-slide-up': {
          '0%': { transform: 'translateY(120%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-green': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(34,197,94,0.7)' },
          '50%': { transform: 'scale(1.2)', boxShadow: '0 0 0 8px rgba(34,197,94,0)' },
        },
      },
      animation: {
        'logo-drop': 'logo-drop 0.7s ease-out forwards',
        'cta-slide-up': 'cta-slide-up 0.7s ease-out forwards',
        'fade-in': 'fade-in 0.15s ease-out forwards',
        'pulse-green': 'pulse-green 2s infinite',
      },
    },
  },
  plugins: [],
};
