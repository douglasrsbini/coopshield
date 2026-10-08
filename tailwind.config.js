/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Instrução vital para o Tailwind obedecer ao toggle do React
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--primary) / <alpha-value>)',
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        textMain: 'rgb(var(--text-main) / <alpha-value>)',
        textMuted: 'rgb(var(--text-muted) / <alpha-value>)',
        amber: {
          500: '#F59E0B',
        },
      }
    },
  },
  plugins: [],
}