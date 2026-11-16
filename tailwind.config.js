/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        space: {
          950: "#03050b",
          900: "#070b16",
          800: "#0d1424",
          700: "#152038",
          600: "#22304f",
        },
        pleiad: {
          300: "#b9d4ff",
          400: "#8fb8ff",
          500: "#5f95f5",
        },
        candidate: { 400: "#fbbf24", 500: "#f59e0b" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
