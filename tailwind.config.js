/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Accent comes from a CSS variable (src/index.css) so it can be rebranded in one place
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        ink: '#1D1D1F',
        surface: '#F5F5F7',
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
