import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Messages = { [key: string]: string | string[] | Messages };

const load = (locale: string) => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Messages;

/** Every leaf as "a.b.c" (array items as "a.b.0"), with its text. */
function leaves(node: Messages | string[], prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string") out.set(prefix + key, value);
    else for (const [path, text] of leaves(value, `${prefix}${key}.`)) out.set(path, text);
  }
  return out;
}

describe("interface text", () => {
  const en = leaves(load("en"));
  const he = leaves(load("he"));

  it("has the same keys in English and Hebrew", () => {
    expect([...he.keys()].filter((key) => !en.has(key))).toEqual([]);
    expect([...en.keys()].filter((key) => !he.has(key))).toEqual([]);
  });

  it("uses the same placeholders in both languages", () => {
    // In a plural or select message only the argument itself is compared, not the words of its branches.
    const names = (text: string) =>
      [...text.matchAll(/, (?:plural|select),/.test(text) ? /\{(\w+),/g : /\{(\w+)\}/g)].map((match) => match[1]!).sort().join(",");
    expect([...en.keys()].filter((key) => names(en.get(key)!) !== names(he.get(key) ?? ""))).toEqual([]);
  });

  it("does not describe the product as unfinished or promise follow-up questions", () => {
    const stale = [/in development/i, /being built/i, /not a finished service/i, /not connected yet/i, /follow[- ]up/i, /new accounts are not open on this/i, /בפיתוח/, /נמצאות בבנייה/, /לא שירות מוגמר/, /שאלות המשך/, /שאלת המשך/, /באתר ההדגמה הזה לא נפתחים/];
    const text = [...en.values(), ...he.values()];
    expect(stale.filter((pattern) => text.some((value) => pattern.test(value))).map(String)).toEqual([]);
  });
});
