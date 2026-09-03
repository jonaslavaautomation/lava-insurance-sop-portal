/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FDF3F2',
          100: '#FBE1DE',
          200: '#F5C0BB',
          300: '#ED968D',
          400: '#E2685C',
          500: '#D5402F',
          600: '#C22A1D',
          700: '#A11F15',
          800: '#821A12',
          900: '#5E1710',
        },
      },
    },
  },
  plugins: [],
};
