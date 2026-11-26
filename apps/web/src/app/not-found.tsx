import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { directionOf } from "@/i18n/routing";
import LocalizedNotFound from "./[locale]/not-found";
import { heebo, jakarta, plexMono } from "./fonts";
import "./globals.css";

/*
 * Every address no route matches (for example /he/no-such-page) is rendered here, on the server,
 * as a 404. The root layout leaves <html> to the locale layout, so this page renders its own
 * document, in the language the locale middleware resolved for the request (English when the
 * address has none). Inside a locale, notFound() from a page still uses [locale]/not-found.tsx.
 */
export default async function RootNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");
  return (
    <html lang={locale} dir={directionOf(locale)} className={`${jakarta.variable} ${heebo.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        {/* React hoists these into <head>. */}
        <title>{t("title")}</title>
        <meta name="robots" content="noindex" />
        <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false} storageKey="hks-theme-choice">
          <NextIntlClientProvider>
            <LocalizedNotFound />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
