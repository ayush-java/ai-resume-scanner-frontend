/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'ui-sans-serif', 'SF Pro Text', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f3f7ff',
          100: '#e0ecff',
          200: '#bed4ff',
          300: '#93b3ff',
          400: '#6286ff',
          500: '#3b5cff',
          600: '#263fdd',
          700: '#1c32b1',
          800: '#172985',
          900: '#141f63',
        },
      },
    },
  },
  plugins: [],
};
