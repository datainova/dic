/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          200: '#b8ddff',
          300: '#8ac8ff',
          400: '#5aaeff',
          500: '#2d91ff',
          600: '#1976e6',
          700: '#145fba',
          800: '#134f98',
          900: '#133f77',
        },
      },
    },
  },
  plugins: [],
}

