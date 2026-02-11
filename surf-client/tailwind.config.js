/** @type {import('tailwindcss').Config} */
export default {
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
      },
      animation: {
        'logo-drop': 'logo-drop 0.7s ease-out forwards',
        'cta-slide-up': 'cta-slide-up 0.7s ease-out forwards',
      },
    },
  },
  plugins: [],
};
