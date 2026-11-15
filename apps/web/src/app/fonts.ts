import localFont from "next/font/local";

export const jakarta = localFont({
  src: [
    { path: "../fonts/plus-jakarta-sans-latin-wght-normal.woff2", weight: "200 800", style: "normal" },
  ],
  variable: "--font-jakarta",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

/** Hebrew glyphs only; Latin runs inside Hebrew text stay in Plus Jakarta Sans. */
export const heebo = localFont({
  src: [{ path: "../fonts/heebo-hebrew-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-heebo",
  display: "swap",
  adjustFontFallback: false,
});

export const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
});
