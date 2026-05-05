import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        vibemoji: {
          primary: "#FF5C8A",
          "primary-content": "#ffffff",
          secondary: "#9C7BFF",
          accent: "#FFD166",
          neutral: "#1F1B2E",
          "base-100": "#FFFFFF",
          "base-200": "#FAF7FF",
          "base-300": "#EFE8FF",
          info: "#7DD3FC",
          success: "#34D399",
          warning: "#FBBF24",
          error: "#F87171",
        },
      },
    ],
  },
};

export default config;
