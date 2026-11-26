import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BASE } from "./client.ts";

/** Server-rendered pages, against the production build (see scripts/http-tests.sh). */

const here = path.dirname(fileURLToPath(import.meta.url));
const messages = async (locale: "he" | "en") =>
  JSON.parse(await readFile(path.join(here, "..", "..", "messages", `${locale}.json`), "utf8")) as { notFound: { title: string } };
// The HTML escapes apostrophes and quotes; compare on text that has none.
const plain = (text: string) => text.replace(/['’"].*$/, "");

describe("not-found page", () => {
  for (const [locale, dir] of [["he", "rtl"], ["en", "ltr"]] as const) {
    it(`is rendered on the server in ${locale}, with lang and dir, and a 404 status`, async () => {
      const response = await fetch(`${BASE}/${locale}/no-such-page-${Date.now()}`, { redirect: "manual" });
      expect(response.status).toBe(404);
      const html = await response.text();
      expect(html).toMatch(new RegExp(`<html[^>]*\\slang="${locale}"`));
      expect(html).toMatch(new RegExp(`<html[^>]*\\sdir="${dir}"`));
      // In the server-rendered heading, not only in the script payload that hydrates the page.
      const title = plain((await messages(locale)).notFound.title);
      expect(html).toMatch(new RegExp(`<h1[^>]*>${title}`));
    });
  }
});
