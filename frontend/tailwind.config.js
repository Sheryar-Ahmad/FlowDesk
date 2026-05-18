/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          500: "#6366f1",
          600: "#4f46e5",
        },
        dark: {
          100: "#1e1e2e",
          200: "#181825",
          300: "#11111b",
        }
      },
    },
  },
  plugins: [],
}
