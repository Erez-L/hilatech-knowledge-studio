import type { MetadataRoute } from "next";

/**
 * What search engines are told about the site. Kept free of server imports so it can be unit
 * tested; `app/robots.ts` and `app/sitemap.ts` pass in the public address and the locales.
 */

/** Public pages worth indexing, as paths under a locale. Sign-in and sign-up pages are left out. */
export const indexedPages = ["", "/help", "/demo"] as const;

/** Paths under a locale that are private or hold one-time tokens. */
const privatePages = ["/app", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email"] as const;

const originOf = (baseUrl: string) => new URL(baseUrl).origin;

export function buildRobots(baseUrl: string, locales: readonly string[]): MetadataRoute.Robots {
  const origin = originOf(baseUrl);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", ...locales.flatMap((locale) => privatePages.map((page) => `/${locale}${page}`))] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}

export function buildSitemap(baseUrl: string, locales: readonly string[]): MetadataRoute.Sitemap {
  const origin = originOf(baseUrl);
  return indexedPages.flatMap((page) => {
    const languages = Object.fromEntries(locales.map((locale) => [locale, `${origin}/${locale}${page}`]));
    return locales.map((locale) => ({
      url: `${origin}/${locale}${page}`,
      changeFrequency: "monthly" as const,
      priority: page === "" ? 1 : 0.7,
      alternates: { languages },
    }));
  });
}
