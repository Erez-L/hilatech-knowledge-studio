/** Control characters except tab and newline. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** Bidi and zero-width formatting marks that extraction often leaves behind. */
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿­]/g;
/** Hebrew cantillation and vowel points (niqqud). */
const HEBREW_POINTS = /[֑-ׇֽֿׁׂׅׄ]/g;

/** Text as shown to users: composed, cleaned of control noise, whitespace tidied. */
export function normalizeForDisplay(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text for lexical matching: display form, lowercased, without Hebrew points or punctuation variants. */
export function normalizeForSearch(text: string): string {
  return normalizeForDisplay(text)
    .replace(HEBREW_POINTS, "")
    .replace(/[׳’‘]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/־/g, "-")
    .toLowerCase();
}

/** Dominant language by letter count. */
export function detectLanguage(text: string): "he" | "en" | "mixed" | null {
  const hebrew = (text.match(/[א-ת]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = hebrew + latin;
  if (total < 20) return null;
  const share = hebrew / total;
  return share > 0.8 ? "he" : share < 0.2 ? "en" : "mixed";
}

/** Rough token estimate for context budgeting. Hebrew uses more tokens per character than English. */
export function estimateTokens(text: string): number {
  const hebrew = (text.match(/[֐-׿]/g) ?? []).length;
  return Math.ceil(hebrew / 2 + (text.length - hebrew) / 4);
}
