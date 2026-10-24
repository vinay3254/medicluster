/** @type {import('tailwindcss').Config} */
import animate from "tailwindcss-animate";

// MediCluster website palette: ivory, sage, forest ink and copper accents.
// Default Tailwind families are remapped so every page picks up the palette.
const neutral = {
  50: "#f6f7f1", 100: "#eef1e8", 200: "#d7dacf", 300: "#bdc6b7", 400: "#8c9787",
  500: "#62675e", 600: "#4b574c", 700: "#35483a", 800: "#23392b", 900: "#17221d", 950: "#0d1711",
};
const accent = {
  50: "#fcf5ef", 100: "#f7e6d9", 200: "#efd0b9", 300: "#e0ad8c", 400: "#d3906d",
  500: "#c87350", 600: "#ad633f", 700: "#8f5033", 800: "#73412d", 900: "#5e3628", 950: "#321b13",
};
const good = {
  50: "#eef4f0", 100: "#dfe9e2", 200: "#c2d7c9", 300: "#9bbfa8", 400: "#74a389",
  500: "#5b8f72", 600: "#437a5c", 700: "#2f6448", 800: "#264f3a", 900: "#1e3d2d", 950: "#12261c",
};
const caution = {
  50: "#fbf4e8", 100: "#f5e6c8", 200: "#ebcf98", 300: "#ddb166", 400: "#cf983f",
  500: "#c08a2b", 600: "#a17022", 700: "#82581c", 800: "#664519", 900: "#4f3615", 950: "#33230e",
};
const warn = {
  50: "#fcf0ea", 100: "#f8dfd2", 200: "#f0bfa5", 300: "#e89a73", 400: "#e0703f",
  500: "#cc5f2e", 600: "#b4501f", 700: "#92401a", 800: "#733318", 900: "#5a2915", 950: "#3a1a0d",
};
const danger = {
  50: "#fbeeec", 100: "#f1d9d6", 200: "#e7b8b3", 300: "#d98a83", 400: "#cd5f57",
  500: "#c23a34", 600: "#a82f2a", 700: "#8a2622", 800: "#6e1f1c", 900: "#561a18", 950: "#360f0e",
};
const plum = {
  50: "#f4f0f6", 100: "#e8e0ee", 200: "#d3c4de", 300: "#b59fc6", 400: "#9479ab",
  500: "#7a5d93", 600: "#654b7d", 700: "#523d66", 800: "#403051", 900: "#30243d", 950: "#1e1626",
};

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        ...Object.fromEntries(["card", "popover", "primary", "secondary", "muted", "accent", "destructive"].map((name) => [name, {
          DEFAULT: `hsl(var(--${name}))`,
          foreground: `hsl(var(--${name}-foreground))`,
        }])),
        white: "#fbfaf7",
        slate: neutral, gray: neutral, zinc: neutral, stone: neutral,
        blue: accent, indigo: accent, sky: accent, cyan: accent,
        emerald: good, green: good, teal: { ...good, 400: accent[600], 500: neutral[900], 600: neutral[950] },
        amber: caution, yellow: caution,
        orange: warn,
        red: danger, rose: danger, pink: danger,
        violet: plum, purple: plum, fuchsia: plum,
        ink: neutral[900],
        paper: "#fbfaf7",
        surface: "#ffffff",
        sunken: "#e4ebdc",
        line: { DEFAULT: "#d7dacf", strong: "#bdc6b7" },
        navy: {
          950: "#e4ebdc",
          900: "#fbfaf7",
          800: "#fbfaf7",
          700: "#e4ebdc",
          600: "#d7dacf",
        },
        risk: {
          low: "#5b8f72",
          moderate: "#c08a2b",
          high: "#e0703f",
          critical: "#c23a34",
          noise: "#a19c92",
        },
      },
      borderRadius: {
        sm: "2px", DEFAULT: "4px", md: "4px", lg: "4px", xl: "6px", "2xl": "8px", "3xl": "12px",
      },
      boxShadow: {
        sm: "0 1px 0 rgba(21,23,26,0.04)",
        DEFAULT: "0 1px 2px rgba(21,23,26,0.06)",
        md: "0 2px 8px rgba(21,23,26,0.06)",
        lg: "0 8px 24px rgba(21,23,26,0.08)",
        xl: "0 12px 32px rgba(21,23,26,0.10)",
        "2xl": "0 20px 48px rgba(21,23,26,0.14)",
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "IBM Plex Sans", "Arial", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        // Legacy display classes use the website sans family, too.
        serif: ["Hanken Grotesk", "IBM Plex Sans", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [animate],
};
