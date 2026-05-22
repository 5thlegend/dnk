import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        fg: "#fafafa",
        muted: "#6b6b6b",
        line: "#1a1a1a",
        accent: "#d4ff00",
      },
    },
  },
  plugins: [],
};

export default config;
