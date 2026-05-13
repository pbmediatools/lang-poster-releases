import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        lang: {
          dark: "#3a3a3a",
          accent: "#a02633",
        },
      },
    },
  },
  plugins: [],
};

export default config;
