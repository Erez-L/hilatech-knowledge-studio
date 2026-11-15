/**
 * LIVE TEST - runs the evaluation set through the full pipeline with REAL providers (paid).
 * Skipped unless LIVE_EVALUATION=1, and skipped with a message when
 * samples/evaluation/questions.json does not exist.
 *
 * It REPORTS quality numbers (artifacts/evaluation/*.json and *.md). It fails only on safety
 * invariants: a delivered citation to a label that was not supplied, a source from another
 * tenant, or an answer not saved with pipeline_mode = 'live'.
 * One chat call at most per question; MAX_QUESTIONS caps the run (default 50).
 * See docs/REAL_PROVIDER_VERIFICATION.md, steps 11 to 13.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ask,
  createLiveHarness,
  createTenant,
  labelsIn,
  liveGate,
  liveSuite,
  optionalEnv,
  pageInRange,
  PIPELINE_REQUIRED_ENV,
  readSample,
  REPO_ROOT,
  round,
  savedAnswer,
  uploadAndWait,
  vectorStats,
  type CandidateView,
  type LiveHarness,
  type Tenant,
} from "./helpers.ts";

type ExpectedSource = { document: string; edition: string; page?: number; section?: string };
type EvaluationItem = {
  id: string;
  category: string;
  language: string;
  question: string;
  expected: { answerable: boolean; sources: ExpectedSource[]; mustContain: string[] };
};

/** The evaluation set. EVALUATION_QUESTIONS_FILE may point at another file with the same shape (for example a draft set). */
const QUESTIONS_FILE = path.resolve(REPO_ROOT, optionalEnv("EVALUATION_QUESTIONS_FILE") ?? path.join("samples", "evaluation", "questions.json"));
const REPORT_DIR = path.join(REPO_ROOT, "artifacts", "evaluation");
const DEFAULT_MAX_QUESTIONS = 50;

const gate = liveGate(
  "Evaluation set with real providers",
  "LIVE_EVALUATION",
  PIPELINE_REQUIRED_ENV,
  'Needs samples/evaluation/questions.json; the database name must contain "test" or "verify".',
);

/** Reads and validates the evaluation set. Accepts a bare array or an object with a `questions` array. */
function loadItems(): EvaluationItem[] {
  const parsed: unknown = JSON.parse(readFileSync(QUESTIONS_FILE, "utf8"));
  const list = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(list)) throw new Error("questions.json must be an array, or an object with a `questions` array");
  return list.map((raw, i) => {
    const item = raw as Partial<EvaluationItem>;
    const expected = item.expected as Partial<EvaluationItem["expected"]> | undefined;
    const problem =
      typeof item.id !== "string" || !item.id ? "id"
      : typeof item.category !== "string" ? "category"
      : typeof item.language !== "string" ? "language"
      : typeof item.question !== "string" || !item.question.trim() ? "question"
      : !expected || typeof expected.answerable !== "boolean" ? "expected.answerable"
      : null;
    if (problem) throw new Error(`questions.json item ${i} (${String(item.id ?? "no id")}): missing or invalid ${problem}`);
    const sources = (Array.isArray(expected!.sources) ? expected!.sources : []).map((source) => {
      if (typeof source?.document !== "string" || typeof source?.edition !== "string") {
        throw new Error(`questions.json item ${item.id}: every expected source needs document and edition`);
      }
      return source;
    });
    return {
      id: item.id!, category: item.category!, language: item.language!, question: item.question!,
      expected: { answerable: expected!.answerable!, sources, mustContain: Array.isArray(expected!.mustContain) ? expected!.mustContain.map(String) : [] },
    };
  });
}

const maxQuestions = () => {
  const raw = optionalEnv("MAX_QUESTIONS");
  if (!raw) return DEFAULT_MAX_QUESTIONS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error("MAX_QUESTIONS must be a positive integer");
  return value;
};

/** Comparison that ignores case, Unicode composition and runs of white space. */
const fold = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const editionKey = (source: { document: string; edition: string }) => `${source.edition}/${source.document}`;

type Row = {
  id: string;
  category: string;
  language: string;
  expectedAnswerable: boolean;
  answerStatus: string | null;
  errorCode: string | null;
  modelCalled: boolean;
  topSimilarity: number | null;
  /** Best similarity among candidates that come from an expected document (and page, when one is given). */
  bestExpectedSimilarity: number | null;
  bestExpectedRank: number | null;
  correctRefusal: boolean | null;
  documentMatch: boolean | null;
  allDocumentsMatch: boolean | null;
  /** The page shown by a citation (the passage's first page) equals the expected page, and the section matches. */
  locationMatch: boolean | null;
  /** The expected page lies within the cited passage's page range, and the section matches. */
  locationRangeMatch: boolean | null;
  mustContainAll: boolean | null;
  missingTerms: string[];
  cited: { label: string; document: string; page: number | null; section: string | null; similarity: number }[];
  rawUnsuppliedLabels: string[];
  inputTokens: number | null;
  outputTokens: number | null;
  violations: string[];
};

if (gate.enabled && gate.missing.length === 0 && !existsSync(QUESTIONS_FILE)) {
  describe.skip(`Evaluation set with real providers [SKIPPED: ${path.relative(REPO_ROOT, QUESTIONS_FILE)} does not exist yet]`, () => {
    it("skipped: no evaluation set", () => {});
  });
} else {
  liveSuite(gate, () => {
    const allItems = loadItems();
    const items = allItems.slice(0, maxQuestions());
    const needed = new Map<string, ExpectedSource>();
    // Ingest every edition the WHOLE set refers to, so capped runs retrieve from the same corpus as full runs.
    for (const item of allItems) for (const source of item.expected.sources) needed.set(editionKey(source), source);

    let harness: LiveHarness;
    let tenant: Tenant;
    let otherTenant: Tenant;
    const documentIdOf = new Map<string, string>(); // "edition/document" -> document id in `tenant`
    const titles = new Map<string, string>();
    const otherTenantDocumentIds = new Set<string>();
    const rows: Row[] = [];
    const violations: string[] = [];
    let indexInfo: unknown = null;

    beforeAll(async () => {
      console.info(
        `[live:evaluation] ${items.length} of ${allItems.length} questions will be asked (MAX_QUESTIONS=${maxQuestions()}).\n` +
          `[live:evaluation] Estimated model calls: at most ${items.length} chat calls (fewer when the similarity thresholds stop a question first); ` +
          `${items.length} query-embedding calls; document-embedding calls for ${needed.size} document edition(s) plus 1 decoy copy ` +
          `(one call per ${optionalEnv("EMBEDDINGS_BATCH_SIZE") ?? "64"} chunks).`,
      );
      harness = await createLiveHarness({ chatCalls: items.length, embeddingCalls: items.length + 40 * (needed.size + 1), embeddingTexts: 20_000 });
      tenant = await createTenant(harness.database, "live-evaluation");
      otherTenant = await createTenant(harness.database, "live-evaluation-other");

      for (const [key, source] of needed) {
        const sample = await readSample(source.document, source.edition);
        const document = await uploadAndWait(harness, tenant, sample);
        if (document.status !== "ready") throw new Error(`Ingestion of ${sample.file} ended as ${document.status} (${document.failureCode ?? "no code"})`);
        documentIdOf.set(key, document.id);
        titles.set(document.id, `${source.edition}/${document.title}`);
        const stats = await vectorStats(harness.database, tenant, document.id);
        if (stats.length !== 1 || stats[0]!.kind !== "live" || stats[0]!.min_dims !== 1024) {
          throw new Error(`Vectors of ${sample.file} are not under a single live 1024-dimension index`);
        }
        indexInfo = { kind: stats[0]!.kind, provider: stats[0]!.provider, modelId: stats[0]!.model_id };
        console.info(`[live:evaluation] ingested ${sample.file}: ${document.chunkCount} chunks`);
      }
      // A second organization holds a copy of one document. Nothing of it may ever be retrieved or cited for `tenant`.
      const first = [...needed.values()][0];
      if (first) {
        const decoy = await uploadAndWait(harness, otherTenant, await readSample(first.document, first.edition));
        if (decoy.status === "ready") otherTenantDocumentIds.add(decoy.id);
      }
    });

    afterAll(async () => {
      if (rows.length) await writeReport();
      await harness?.close();
    });

    it("has questions to ask", () => {
      expect(items.length).toBeGreaterThan(0);
    });

    for (const item of items) {
      it(`${item.id} [${item.category}/${item.language}]`, async () => {
        const row = await evaluate(item);
        rows.push(row);
        violations.push(...row.violations.map((v) => `${item.id}: ${v}`));
        // Quality is reported, not asserted. Only safety invariants fail a question.
        expect(row.violations).toEqual([]);
      });
    }

    it("reports totals; fails only on safety invariants", () => {
      console.info(`[live:evaluation] ${summaryTable(aggregate(rows))}`);
      expect(violations).toEqual([]);
    });

    async function evaluate(item: EvaluationItem): Promise<Row> {
      const problems: string[] = [];
      const result = await ask(harness, tenant, item.question, item.language === "he" ? "he" : "en");
      const conversationId = result.start?.conversationId;
      const saved = conversationId ? await savedAnswer(harness, tenant, conversationId, titles).catch(() => null) : null;
      const sources = result.done?.sources ?? [];
      const candidates: CandidateView[] = saved?.candidates ?? [];

      // --- Safety invariants -------------------------------------------------------------
      if (result.start && result.start.pipelineMode !== "live") problems.push(`pipeline mode announced as ${result.start.pipelineMode}`);
      if (saved && saved.message.pipelineMode !== "live") problems.push(`saved pipeline_mode is ${String(saved.message.pipelineMode)}`);
      if (!saved && !result.error) problems.push("no assistant message was saved");
      // Labels that reached the client or the database must all have been in the prompt.
      const delivered = new Set([...result.citedLabels, ...sources.map((s) => s.label), ...(saved ? saved.citations.map((c) => c.label) : []), ...(saved ? labelsIn(saved.message.content) : [])]);
      for (const label of delivered) {
        if (!result.suppliedLabels.includes(label)) problems.push(`citation to unsupplied label ${label} was delivered`);
      }
      if (/\[\s*S\d{1,3}\s*\]/.test(result.text)) problems.push("a citation marker reached the client as text");
      // Tenant isolation: every cited source and every retrieved candidate belongs to this tenant's documents.
      for (const source of sources) {
        if (otherTenantDocumentIds.has(source.documentId) || !titles.has(source.documentId)) problems.push(`cross-tenant or unknown source cited: document ${source.documentId}`);
      }
      for (const candidate of candidates) {
        if (candidate.documentId === null || otherTenantDocumentIds.has(candidate.documentId) || !titles.has(candidate.documentId)) {
          problems.push(`retrieved candidate at rank ${candidate.rank} does not belong to this tenant's documents`);
        }
      }

      // --- Quality measurements (reported only) -----------------------------------------
      const status = result.done?.answerStatus ?? null;
      const refused = status === "insufficient_evidence";
      const expectedIds = item.expected.sources.map((source) => ({ source, documentId: documentIdOf.get(editionKey(source)) }));
      const sectionOf = (path_: string[] | null) => (path_ ?? []).join(" > ");
      const sectionHit = (source: ExpectedSource, section: string[] | null) =>
        source.section === undefined || fold(sectionOf(section)).includes(fold(source.section));
      // Strict: the page a citation SHOWS (the passage's first page) is the expected page.
      const shownHit = (source: ExpectedSource, page: number | null, section: string[] | null) =>
        (source.page === undefined || source.page === page) && sectionHit(source, section);
      // Lenient: the expected page lies inside the passage's page range (a passage can span pages).
      const rangeHit = (source: ExpectedSource, passage: { pageNumber: number | null; pageEnd: number | null; sectionPath: string[] | null }) =>
        (source.page === undefined || pageInRange(source.page, passage)) && sectionHit(source, passage.sectionPath);
      const documentMatch = sources.some((cited) => expectedIds.some((e) => e.documentId === cited.documentId));
      // For questions that need several documents: every expected document (same edition) is cited.
      const allDocumentsMatch = expectedIds.every((e) => sources.some((cited) => cited.documentId === e.documentId));
      const locationMatch = sources.some((cited) => expectedIds.some((e) => e.documentId === cited.documentId && shownHit(e.source, cited.pageNumber, cited.sectionPath)));
      const locationRangeMatch = sources.some((cited) => {
        const passage = saved?.passageOf(cited.chunkId) ?? { pageNumber: cited.pageNumber, pageEnd: null, sectionPath: cited.sectionPath };
        return expectedIds.some((e) => e.documentId === cited.documentId && rangeHit(e.source, passage));
      });
      const expectedCandidates = candidates.filter((c) => expectedIds.some((e) => e.documentId === c.documentId && rangeHit(e.source, c)));
      const missingTerms = item.expected.mustContain.filter((term) => !fold(result.text).includes(fold(term)));
      const rawUnsupplied = result.rawModelText ? labelsIn(result.rawModelText).filter((label) => !result.suppliedLabels.includes(label)) : [];

      return {
        id: item.id, category: item.category, language: item.language, expectedAnswerable: item.expected.answerable,
        answerStatus: status, errorCode: result.error?.code ?? null, modelCalled: result.modelCalled,
        topSimilarity: candidates[0] ? candidates[0].similarity : null,
        bestExpectedSimilarity: expectedCandidates[0]?.similarity ?? null,
        bestExpectedRank: expectedCandidates[0]?.rank ?? null,
        correctRefusal: item.expected.answerable ? null : refused,
        documentMatch: item.expected.answerable && item.expected.sources.length ? documentMatch : null,
        allDocumentsMatch: item.expected.answerable && item.expected.sources.length ? allDocumentsMatch : null,
        locationMatch: item.expected.answerable && item.expected.sources.length ? locationMatch : null,
        locationRangeMatch: item.expected.answerable && item.expected.sources.length ? locationRangeMatch : null,
        mustContainAll: item.expected.mustContain.length ? missingTerms.length === 0 : null,
        missingTerms,
        cited: sources.map((s) => ({ label: s.label, document: titles.get(s.documentId) ?? s.documentTitle, page: s.pageNumber, section: s.sectionPath ? sectionOf(s.sectionPath) : null, similarity: round(s.similarity) })),
        rawUnsuppliedLabels: rawUnsupplied,
        inputTokens: saved?.message.inputTokens ?? null, outputTokens: saved?.message.outputTokens ?? null,
        violations: problems,
      };
    }

    async function writeReport() {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const config = harness.config;
      const header = {
        generatedAt: new Date().toISOString(),
        note: "Produced by tests/live/evaluation.live.test.ts with real providers. Quality figures are measurements, not pass/fail results.",
        questionsAsked: rows.length,
        questionsInSet: allItems.length,
        providers: { chat: harness.chat.descriptor, embeddings: harness.embeddings.descriptor, embeddingIndex: indexInfo },
        settings: {
          RAG_TOP_K: config.RAG_TOP_K, RAG_MAX_CONTEXT_CHUNKS: config.RAG_MAX_CONTEXT_CHUNKS, RAG_MIN_SIMILARITY: config.RAG_MIN_SIMILARITY,
          RAG_EVIDENCE_MIN_SIMILARITY: config.RAG_EVIDENCE_MIN_SIMILARITY, CHUNK_TARGET_CHARS: config.CHUNK_TARGET_CHARS,
          CHUNK_MAX_CHARS: config.CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS: config.CHUNK_OVERLAP_CHARS, LLM_MAX_OUTPUT_TOKENS: config.LLM_MAX_OUTPUT_TOKENS,
        },
        calls: { chat: harness.chat.calls.length, embeddingCalls: harness.embeddings.calls, embeddingTexts: harness.embeddings.texts },
        tokens: { chatInput: sum(rows.map((r) => r.inputTokens)), chatOutput: sum(rows.map((r) => r.outputTokens)) },
        safetyViolations: violations,
      };
      const totals = aggregate(rows);
      await mkdir(REPORT_DIR, { recursive: true });
      const base = path.join(REPORT_DIR, `evaluation-${stamp}`);
      await writeFile(`${base}.json`, JSON.stringify({ ...header, totals, questions: rows }, null, 2));
      await writeFile(`${base}.md`, markdown(header, totals, rows));
      console.info(`[live:evaluation] report written: ${path.relative(REPO_ROOT, base)}.json and .md`);
    }
  });
}

/* ------------------------------------------------------------ aggregation */

type Totals = {
  category: string;
  questions: number;
  errors: number;
  unanswerable: number;
  correctRefusals: number;
  answerable: number;
  answered: number;
  wrongRefusals: number;
  uncited: number;
  withExpectedSources: number;
  documentMatches: number;
  allDocumentsMatches: number;
  locationMatches: number;
  locationRangeMatches: number;
  withMustContain: number;
  mustContainAll: number;
  rawUnsuppliedLabelAnswers: number;
  deliveredUnsuppliedCitations: number;
  safetyViolations: number;
};

const sum = (values: (number | null)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0);

function aggregate(rows: Row[]): Totals[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
  const count = (list: Row[], test: (row: Row) => boolean) => list.filter(test).length;
  const totalsOf = (category: string, list: Row[]): Totals => ({
    category,
    questions: list.length,
    errors: count(list, (r) => r.errorCode !== null),
    unanswerable: count(list, (r) => !r.expectedAnswerable),
    correctRefusals: count(list, (r) => r.correctRefusal === true),
    answerable: count(list, (r) => r.expectedAnswerable),
    answered: count(list, (r) => r.expectedAnswerable && r.answerStatus === "answered"),
    wrongRefusals: count(list, (r) => r.expectedAnswerable && r.answerStatus === "insufficient_evidence"),
    uncited: count(list, (r) => r.answerStatus === "uncited"),
    withExpectedSources: count(list, (r) => r.documentMatch !== null),
    documentMatches: count(list, (r) => r.documentMatch === true),
    allDocumentsMatches: count(list, (r) => r.allDocumentsMatch === true),
    locationMatches: count(list, (r) => r.locationMatch === true),
    locationRangeMatches: count(list, (r) => r.locationRangeMatch === true),
    withMustContain: count(list, (r) => r.mustContainAll !== null),
    mustContainAll: count(list, (r) => r.mustContainAll === true),
    rawUnsuppliedLabelAnswers: count(list, (r) => r.rawUnsuppliedLabels.length > 0),
    deliveredUnsuppliedCitations: count(list, (r) => r.violations.some((v) => v.includes("unsupplied label"))),
    safetyViolations: sum(list.map((r) => r.violations.length)),
  });
  return [...[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([category, list]) => totalsOf(category, list)), totalsOf("ALL", rows)];
}

function summaryTable(totals: Totals[]): string {
  const lines = [
    "| Category | Questions | Errors | Correct refusals | Answered (of answerable) | Wrong refusals | Uncited | Cited document matches | All expected documents cited | Cited page/section matches (page shown) | Cited page/section matches (passage covers page) | mustContain present | Model wrote an unsupplied label (filtered out) | Unsupplied citation delivered (must be 0) | Safety violations |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...totals.map(
      (t) =>
        `| ${t.category} | ${t.questions} | ${t.errors} | ${t.correctRefusals}/${t.unanswerable} | ${t.answered}/${t.answerable} | ${t.wrongRefusals} | ${t.uncited} | ` +
        `${t.documentMatches}/${t.withExpectedSources} | ${t.allDocumentsMatches}/${t.withExpectedSources} | ${t.locationMatches}/${t.withExpectedSources} | ${t.locationRangeMatches}/${t.withExpectedSources} | ${t.mustContainAll}/${t.withMustContain} | ${t.rawUnsuppliedLabelAnswers} | ${t.deliveredUnsuppliedCitations} | ${t.safetyViolations} |`,
    ),
  ];
  return `per-category counts:\n${lines.join("\n")}`;
}

function markdown(header: Record<string, unknown> & { safetyViolations: string[] }, totals: Totals[], rows: Row[]): string {
  const cell = (value: unknown) => String(value ?? "-").replace(/\|/g, "\\|").replace(/\s+/g, " ");
  const mark = (value: boolean | null) => (value === null ? "n/a" : value ? "yes" : "NO");
  return [
    "# Evaluation report (real providers)",
    "",
    "Produced by `tests/live/evaluation.live.test.ts`. The quality figures are measurements for a person to read; the test fails only on the safety invariants listed at the end.",
    "",
    "```json",
    JSON.stringify({ ...header, safetyViolations: undefined }, null, 2),
    "```",
    "",
    "## Counts",
    "",
    summaryTable(totals).replace(/^per-category counts:\n/, ""),
    "",
    "Column notes: fractions are `hits/eligible`. \"Cited document matches\" counts answerable questions where at least one cited source is an expected document (same edition, matched by the uploaded document's ID, not by its title); \"All expected documents cited\" requires every expected document, which matters for multi-source questions. \"Cited page/section matches (page shown)\" additionally requires that the page shown by the citation, which is the first page of the cited passage, equals the expected page, and that the expected section is a substring of the section path, when the question specifies them. \"(passage covers page)\" accepts any cited passage whose page range includes the expected page; a gap between the two columns means citations point at the start of a multi-page passage rather than at the page holding the fact. \"Model wrote an unsupplied label\" counts answers in which the raw model output contained a label that was not in the prompt; the citation filter removes these before delivery.",
    "",
    "## Questions",
    "",
    "| ID | Category | Lang | Expected | Result | Model called | Top similarity | Best expected-source similarity (rank) | Document match | Location match (shown) | Location match (range) | mustContain | Missing terms | Cited |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${cell(r.id)} | ${cell(r.category)} | ${cell(r.language)} | ${r.expectedAnswerable ? "answer" : "refuse"} | ${cell(r.errorCode ? `ERROR ${r.errorCode}` : r.answerStatus)} | ${r.modelCalled ? "yes" : "no"} | ` +
        `${cell(r.topSimilarity)} | ${r.bestExpectedSimilarity === null ? "not retrieved" : `${r.bestExpectedSimilarity} (${r.bestExpectedRank})`} | ${mark(r.documentMatch)} | ${mark(r.locationMatch)} | ${mark(r.locationRangeMatch)} | ${mark(r.mustContainAll)} | ` +
        `${cell(r.missingTerms.join("; ") || "-")} | ${cell(r.cited.map((c) => `${c.label} ${c.document}${c.page ? ` p.${c.page}` : c.section ? ` §${c.section}` : ""}`).join("; ") || "-")} |`,
    ),
    "",
    "## Safety invariants",
    "",
    header.safetyViolations.length ? header.safetyViolations.map((v) => `- VIOLATION: ${v}`).join("\n") : "No violations: no delivered citation to an unsupplied label, no cross-tenant source, every answer saved with pipeline_mode = 'live'.",
    "",
    "## Calibration aid",
    "",
    "For threshold calibration, compare `Top similarity` of the questions that should be refused with `Best expected-source similarity` of the questions that should be answered. See docs/REAL_PROVIDER_VERIFICATION.md.",
    "",
  ].join("\n");
}
