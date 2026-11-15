import { defineRouting } from "next-intl/routing";

export const locales = ["en", "he"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
});

export function directionOf(locale: string): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}
