import { describe, expect, it } from "vitest";
import { buildRobots, buildSitemap, indexedPages } from "../../src/lib/site.ts";

const locales = ["en", "he"] as const;

describe("robots.txt and sitemap.xml", () => {
  it("lists every public page once per language, with its translations", () => {
    const entries = buildSitemap("https://knowledge.example.test/", locales);
    expect(entries).toHaveLength(indexedPages.length * locales.length);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://knowledge.example.test/en",
      "https://knowledge.example.test/he",
      "https://knowledge.example.test/en/help",
      "https://knowledge.example.test/he/help",
      "https://knowledge.example.test/en/demo",
      "https://knowledge.example.test/he/demo",
    ]);
    expect(entries[3]!.alternates).toEqual({ languages: { en: "https://knowledge.example.test/en/help", he: "https://knowledge.example.test/he/help" } });
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length);
  });

  it("keeps the signed-in app, the API and the account pages out of search engines", () => {
    const robots = buildRobots("https://knowledge.example.test/some/path", locales);
    expect(robots.sitemap).toBe("https://knowledge.example.test/sitemap.xml");
    const rule = (robots.rules as { allow: string; disallow: string[] }[])[0]!;
    expect(rule.allow).toBe("/");
    for (const path of ["/api/", "/en/app", "/he/app", "/he/sign-up", "/en/verify-email", "/he/reset-password"]) expect(rule.disallow).toContain(path);
    // Nothing the sitemap lists is disallowed.
    const listed = buildSitemap("https://knowledge.example.test", locales).map((entry) => new URL(entry.url).pathname);
    for (const path of listed) expect(rule.disallow.some((blocked) => path === blocked || path.startsWith(`${blocked}/`))).toBe(false);
  });
});
