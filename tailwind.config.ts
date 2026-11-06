import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0b1f3a",
          deep: "#081426",
          light: "#14315e",
        },
        ink: "#17253b",
        paper: "#f5f7fb",
        teal: {
          DEFAULT: "#0f766e",
          bright: "#14b8a6",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
