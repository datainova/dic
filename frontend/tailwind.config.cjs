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
          50:  '#f4f3f2',
          100: '#e9e8e7',
          200: '#d3d0cd',
          300: '#bcb7b2',
          400: '#9d9691',
          500: '#5a534f',
          600: '#2d2926',   // DataInova primary
          700: '#24211e',
          800: '#1c1917',
          900: '#141312',
        },
      },
    },
  },
  plugins: [],
}
