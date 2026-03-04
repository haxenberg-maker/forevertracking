/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: { 900: '#0f0f13', 800: '#1a1a24', 700: '#242433', 600: '#2e2e42' },
        brand: { green: '#4ade80', blue: '#60a5fa', orange: '#fb923c', purple: '#a78bfa', pink: '#f472b6' }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
