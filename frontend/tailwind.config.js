/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef4fc',
          100: '#dbe8f8',
          200: '#b7d3f6',
          300: '#86b6ef',
          400: '#5598e7',
          500: '#2a78d6',
          600: '#256abf',
          700: '#1c5cab',
          800: '#184f95',
          900: '#104281',
        },
        success: {
          50: '#e8f8e8',
          100: '#c8edc8',
          500: '#0ca30c',
          600: '#0a8a0a',
          700: '#006300',
        },
        warning: {
          50: '#fff6e6',
          100: '#ffe6b3',
          500: '#fab219',
          600: '#e0980a',
          700: '#9a6400',
        },
        danger: {
          50: '#fbe9e9',
          100: '#f5c9c9',
          500: '#d03b3b',
          600: '#b52f2f',
          700: '#e34948',
        },
      },
    },
  },
  plugins: [],
};
