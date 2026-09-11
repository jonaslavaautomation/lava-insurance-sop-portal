/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // LAVA design system — crimson brand scale (600 is the primary
        // action color; `bright` is the higher-voltage accent used for
        // glows/active-state highlights, never large fills).
        brand: {
          50: '#FFF1F3',
          100: '#FFE0E6',
          200: '#FECDD6',
          300: '#FDA4B4',
          400: '#FB7189',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
          bright: '#FF2A5F',
        },
        // Near-black enterprise console backgrounds used by the admin shell.
        ink: {
          DEFAULT: '#0A0D14',
          secondary: '#0D111B',
          surface: '#121723',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
