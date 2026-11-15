/**
 * Checks the generated sample documents with the application's own extractor
 * (the same code path as an upload), not with a PDF viewer.
 *
 *   pnpm exec tsx scripts/check-samples.ts          (from the repository root)
 *
 * 1. All twelve files are detected and extracted; PDF page counts are as designed.
 * 2. Hebrew PDFs: expected sentences appear in LOGICAL order on the expected page.
 *    A PDF stores glyphs in visual order, so reversed Hebrew ("םולש" for "שלום")
 *    is the typical failure; it is reported as such and fails the check.
 * 3. Both editions carry the same numbers on every page / in every section.
 * 4. samples/evaluation/questions.json: every expected source exists in the
 *    generated files, and every mustContain fact occurs in the expected sources.
 *
 * Exits with code 1 if anything fails.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { detectFileType, extractDocument, type ExtractedDocument } from "../packages/ai/src/index.ts";

const root = path.resolve(__dirname, "..");
const EDITIONS = ["en", "he"] as const;
type Edition = (typeof EDITIONS)[number];
const DOCUMENTS: Record<string, { ext: string; pages: number | null }> = {
  "customer-support-handbook": { ext: "pdf", pages: 12 },
  "refund-and-cancellation-policy": { ext: "pdf", pages: 4 },
  "product-and-service-catalog": { ext: "pdf", pages: 6 },
  "employee-onboarding-guide": { ext: "docx", pages: null },
  "remote-work-policy": { ext: "docx", pages: null },
  "holiday-schedule-2027": { ext: "txt", pages: null },
};

/** [document, page, text that must be found on that page in logical order] */
const HEBREW_PDF_EXPECTATIONS: [string, number, string][] = [
  ["customer-support-handbook", 1, "מדריך תמיכת לקוחות"],
  ["customer-support-handbook", 1, "נורת'סטאר שירותים עסקיים היא חברה בדיונית. המסמך הזה הוא תוכן לדוגמה."],
  ["customer-support-handbook", 2, "מוקד התמיכה פתוח בימים ראשון עד חמישי, 08:00 עד 18:00, וביום שישי, 08:00 עד 13:00."],
  ["customer-support-handbook", 2, "צ'אט מוצע ללקוחות בתוכנית Growth ומעלה."],
  ["customer-support-handbook", 7, "7. יעדי זמן תגובה"],
  ["customer-support-handbook", 7, "פניות בעדיפות 1 מקבלות תגובה ראשונה בתוך 30 דקות בשעות הפעילות, ועדכון סטטוס בכל שעה עד שהתקלה נפתרת."],
  ["customer-support-handbook", 8, "פנייה בעדיפות 2 שפתוחה יותר מ-3 ימי עסקים מוסלמת לראש הצוות."],
  ["customer-support-handbook", 11, "נציגי תמיכה רשאים לאשר בעצמם החזרים כספיים של עד $400. החזרים גדולים יותר דורשים אישור של ראש צוות לפני שמודיעים ללקוח."],
  ["customer-support-handbook", 11, "החזרים מעל $2,000 דורשים גם אישור של מנהל הכספים."],
  ["refund-and-cancellation-policy", 3, "תוכניות שנתיות משולמות מראש ל-12 חודשים."],
  ["refund-and-cancellation-policy", 3, "תוכנית שנתית זכאית להחזר מלא בתוך 30 יום ממועד הרכישה. אחרי 30 יום, החודשים שלא נוצלו מוחזרים באופן יחסי, בניכוי דמי ביטול מוקדם של 10%."],
  ["product-and-service-catalog", 3, "3. Payroll Basic"],
  ["product-and-service-catalog", 4, "Bookkeeping Essentials כוללת עד 150 תנועות בחודש, התאמת בנקים חודשית וסיכום כספי רבעוני, במחיר של $290 לחודש."],
  ["product-and-service-catalog", 5, "Bookkeeping Growth כוללת עד 600 תנועות בחודש, מוסיפה רואה חשבון קבוע ודוחות ניהוליים חודשיים, ועולה $640 לחודש."],
  // The table is written column by column: each plan name is followed by its own values.
  ["product-and-service-catalog", 6, "מחיר חודשי היקף כלול דוחות רואה חשבון קבוע"],
  ["product-and-service-catalog", 6, "Bookkeeping Essentials $290 150 תנועות סיכום רבעוני לא"],
  ["product-and-service-catalog", 6, "Bookkeeping Growth $640 600 תנועות דוחות ניהוליים חודשיים כן"],
];

/** The phrases the test suites rely on, at the places they rely on. */
const ENGLISH_ANCHORS: [string, number | null, string][] = [
  ["customer-support-handbook", 7, "first response within 30 minutes"],
  ["customer-support-handbook", 11, "up to $400"],
  ["refund-and-cancellation-policy", 3, "refunded in full within 30 days"],
  ["holiday-schedule-2027", null, "Summer closure: 15 August 2027"],
];

type Loaded = { doc: ExtractedDocument; fileType: string; file: string };
const failures: string[] = [];
const fail = (message: string) => { failures.push(message); console.log(`  FAIL  ${message}`); };
const ok = (message: string) => console.log(`  ok    ${message}`);
const reversed = (text: string) => [...text].reverse().join("");
const pageText = (doc: ExtractedDocument, page: number) => doc.blocks.filter((b) => b.pageNumber === page).map((b) => b.text).join("\n");
const allText = (doc: ExtractedDocument) => doc.blocks.map((b) => b.text).join("\n");
const sectionText = (doc: ExtractedDocument, section: string) => {
  const blocks = doc.blocks.filter((b) => b.sectionPath?.at(-1) === section);
  return blocks.length ? blocks.map((b) => b.text).join("\n") : null;
};

/** Numbers as a sorted list. "יום עסקים אחד" is the natural Hebrew for "1 business day" and counts as 1. */
function numbers(text: string): string {
  const tokens = text.match(/\d+(?:[.,:]\d+)*/g) ?? [];
  for (const _ of text.match(/יום עסקים אחד/g) ?? []) tokens.push("1");
  return tokens.sort().join(" ");
}
const containsFact = (text: string, fact: string) =>
  new RegExp(`(?<![\\d.,:])${fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d:]|[.,]\\d)`).test(text);

async function main() {
  const loaded = new Map<string, Loaded>();
  const get = (document: string, edition: string) => loaded.get(`${edition}/${document}`);

  console.log("1. Extraction of all sample files");
  for (const edition of EDITIONS) {
    for (const [name, spec] of Object.entries(DOCUMENTS)) {
      const file = `samples/northstar/${edition}/${name}.${spec.ext}`;
      try {
        const bytes = await readFile(path.join(root, file));
        const { fileType } = detectFileType(bytes, path.basename(file));
        const doc = await extractDocument(bytes, fileType);
        loaded.set(`${edition}/${name}`, { doc, fileType, file });
        const summary = `${file}: type=${fileType} pages=${doc.pageCount ?? "-"} blocks=${doc.blocks.length} chars=${allText(doc).length}`;
        if (fileType !== spec.ext || doc.pageCount !== spec.pages) fail(`${summary} (expected type=${spec.ext} pages=${spec.pages ?? "-"})`);
        else ok(summary);
      } catch (error) {
        fail(`${file}: ${(error as Error).message}`);
      }
    }
  }

  console.log("\n2. Hebrew PDFs: logical reading order, on the expected page");
  for (const [name, page, sentence] of HEBREW_PDF_EXPECTATIONS) {
    const entry = get(name, "he");
    if (!entry) { fail(`${name} (he) was not extracted`); continue; }
    const text = pageText(entry.doc, page);
    const label = `${name} p.${page}: "${sentence.length > 60 ? `${sentence.slice(0, 60)}…` : sentence}"`;
    if (text.includes(sentence)) ok(label);
    else if (text.includes(reversed(sentence))) fail(`${label} is present but REVERSED (visual order)`);
    else if (allText(entry.doc).includes(sentence)) fail(`${label} is on another page`);
    else fail(`${label} not found. Page text starts: ${text.slice(0, 120)}`);
  }
  for (const [name, page, phrase] of ENGLISH_ANCHORS) {
    const entry = get(name, "en");
    const text = entry ? (page === null ? allText(entry.doc) : pageText(entry.doc, page)) : "";
    if (text.includes(phrase)) ok(`${name} (en)${page ? ` p.${page}` : ""}: "${phrase}"`);
    else fail(`${name} (en)${page ? ` p.${page}` : ""}: "${phrase}" not found`);
  }

  console.log("\n3. Same numbers in both editions, page by page / block by block");
  for (const name of Object.keys(DOCUMENTS)) {
    const en = get(name, "en")?.doc;
    const he = get(name, "he")?.doc;
    if (!en || !he) { fail(`${name}: an edition is missing`); continue; }
    if (en.blocks.length !== he.blocks.length) { fail(`${name}: ${en.blocks.length} blocks in en, ${he.blocks.length} in he`); continue; }
    const different = en.blocks.flatMap((block, i) => {
      const other = he.blocks[i]!;
      const where = block.pageNumber ? `page ${block.pageNumber}` : block.sectionPath ? `"${block.sectionPath.at(-1)}"` : `block ${i + 1}`;
      if (block.pageNumber !== other.pageNumber || (block.sectionPath?.length ?? 0) !== (other.sectionPath?.length ?? 0)) return [`${where}: structure differs`];
      return numbers(block.text) === numbers(other.text) ? [] : [`${where}: en [${numbers(block.text)}] he [${numbers(other.text)}]`];
    });
    if (different.length) fail(`${name}: ${different.join("; ")}`);
    else ok(`${name}: ${en.blocks.length} blocks, numbers identical`);
  }

  console.log("\n4. Evaluation questions");
  const questionsFile = path.join(root, "samples", "evaluation", "questions.json");
  if (!existsSync(questionsFile)) fail("samples/evaluation/questions.json is missing");
  else checkQuestions(JSON.parse(await readFile(questionsFile, "utf8")), get);

  console.log(failures.length ? `\nFAILED: ${failures.length} problem(s)` : "\nAll checks passed.");
  process.exit(failures.length ? 1 : 0);
}

type Source = { document: string; edition: Edition; page?: number; section?: string };
type Question = {
  id: string; category: string; language: Edition; question: string;
  expected: { answerable: boolean; sources: Source[]; mustContain: string[]; notes: string };
};
/** category -> [question language, edition of the expected sources] (null: not fixed by the category) */
const CATEGORIES: Record<string, [Edition | null, Edition | null]> = {
  he_question_he_source: ["he", "he"], en_question_en_source: ["en", "en"],
  he_question_en_source: ["he", "en"], en_question_he_source: ["en", "he"],
  insufficient_evidence: [null, null], multi_source: [null, null],
};

function checkQuestions(questions: Question[], get: (document: string, edition: string) => Loaded | undefined) {
  const before = failures.length;
  const perCategory = new Map<string, number>();
  const ids = new Set<string>();
  let sourcesChecked = 0;
  let factsChecked = 0;
  for (const q of questions) {
    const problem = (message: string) => fail(`${q.id}: ${message}`);
    if (ids.has(q.id)) problem("duplicate id");
    ids.add(q.id);
    perCategory.set(q.category, (perCategory.get(q.category) ?? 0) + 1);
    const rule = CATEGORIES[q.category];
    if (!rule) { problem(`unknown category ${q.category}`); continue; }
    if (/[֐-׿]/.test(q.question) !== (q.language === "he")) problem(`question text does not match language "${q.language}"`);
    if (rule[0] && q.language !== rule[0]) problem(`category expects a ${rule[0]} question`);
    const { answerable, sources, mustContain, notes } = q.expected;
    if (typeof notes !== "string" || !notes) problem("notes are missing");
    if (q.category === "insufficient_evidence") {
      if (answerable || sources.length || mustContain.length) problem("must be answerable=false with no sources and no mustContain");
      continue;
    }
    if (!answerable || sources.length === 0) problem("must be answerable with at least one source");
    if (q.category === "multi_source" && sources.length < 2) problem("needs at least two sources");
    const texts: string[] = [];
    for (const source of sources) {
      sourcesChecked++;
      const at = `${source.edition}/${source.document}${source.page ? ` p.${source.page}` : ""}${source.section ? ` "${source.section}"` : ""}`;
      const entry = get(source.document, source.edition);
      if (!entry) { problem(`${at}: no such document`); continue; }
      if (rule[1] && source.edition !== rule[1]) problem(`${at}: category expects ${rule[1]} sources`);
      if (q.category === "multi_source" && source.edition !== q.language) problem(`${at}: multi_source uses sources in the question language`);
      let text: string | null;
      if (entry.fileType === "pdf") text = source.page && source.page <= (entry.doc.pageCount ?? 0) ? pageText(entry.doc, source.page) : null;
      else if (entry.fileType === "docx") text = source.section ? sectionText(entry.doc, source.section) : null;
      else text = source.page || source.section ? null : allText(entry.doc);
      if (text === null) problem(`${at}: the page or section does not exist in the generated file (PDF needs page, DOCX needs section, TXT neither)`);
      else texts.push(text);
    }
    for (const fact of mustContain) {
      factsChecked++;
      if (!texts.some((text) => containsFact(text, fact))) problem(`mustContain "${fact}" does not occur in the expected sources`);
    }
  }
  for (const category of Object.keys(CATEGORIES)) {
    const count = perCategory.get(category) ?? 0;
    if (count < 6) fail(`category ${category} has ${count} questions (minimum 6)`);
  }
  if (questions.length < 36) fail(`only ${questions.length} questions (minimum 36)`);
  const counts = Object.keys(CATEGORIES).map((c) => `${c}=${perCategory.get(c) ?? 0}`).join(", ");
  if (failures.length === before) ok(`${questions.length} questions (${counts}); ${sourcesChecked} sources and ${factsChecked} facts found in the generated files`);
}

main().catch((error) => { console.error(error); process.exit(1); });
