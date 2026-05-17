/** @type {import("tailwindcss").Config} */
export default {
  // Tell Tailwind which files to scan for CSS classes
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Enable dark mode using a CSS class
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // FlowDesk brand colors
        primary: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          900: "#1e1b4b",
        },
        dark: {
          100: "#1e1e2e",
          200: "#181825",
          300: "#11111b",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}
