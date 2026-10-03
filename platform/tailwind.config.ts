import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

import { TOKENS } from "./src/lib/design-tokens";

/**
 * Every colour comes from `design-tokens.ts`, so a rebrand is one file. Tailwind
 * receives them as CSS variables (defined in globals.css) rather than literals,
 * which is what lets the same classes serve light and dark themes.
 *
 * Extended with DSign theme palette for marketing/landing pages.
 *
 * A handful of fixed colours are added back on top of the tokens: white/black/
 * transparent/current for overlays and media, and the neutral/violet/indigo/
 * fuchsia (plus red/amber for status) ramps the animated AI chat
 * (src/components/ui/animated-ai-chat.tsx) and the Studio are drawn in. That chat band is dark in both themes, so it does not use tokens.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    colors: Object.fromEntries(
      Object.keys(TOKENS.light).map((k) => [k, `rgb(var(--c-${k}) / <alpha-value>)`]),
    ),
    extend: {
      colors: {
        white: colors.white,
        black: colors.black,
        transparent: colors.transparent,
        current: colors.current,
        neutral: colors.neutral,
        violet: colors.violet,
        indigo: colors.indigo,
        fuchsia: colors.fuchsia,
        red: colors.red,
        amber: colors.amber,
        // DSign theme palette for landing/marketing
        dsign: {
          blue: "#0075FF",
          lightblue: "#DAEBFF",
          navyblue: "#002834",
          darkblue: "#000321",
          midnightblue: "#183B56",
          midblue: "#00276F",
          beach: "#8EA9C1",
          lightgrey: "#AEC7E4",
          darkgray: "#90A3B4",
          bluegray: "#7D82A1",
          bluegrey: "#7C8F9E",
          babyblue: "#E2F3F9",
          grey500: "#ECECEC",
        },
      },
      fontFamily: {
        // next/font registers hashed family names; the CSS variables point at them.
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-poppins)", "ui-sans-serif", "sans-serif"],
        poppins: ["var(--font-poppins)", "Poppins", "ui-sans-serif", "sans-serif"],
      },
      borderRadius: {
        card: "0.875rem",
        button: "0.5rem",
      },
      boxShadow: {
        "card-lg": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
