/**
 * Runs samples/evaluation/questions.json against the public-demo documents and
 * writes a report to artifacts/evaluation/.
 *
 *   pnpm demo:seed && pnpm evaluate            (same environment as the app)
 *   pnpm evaluate -- --yes                     (required when the providers are real: one paid chat call per question)
 *
 * What the numbers mean depends on the providers, and the report says which were used:
 * - REAL providers: retrieval quality, grounding and citation correctness for this model pair.
 * - TEST DOUBLES: only that the pipeline runs end to end. The embedding double matches words,
 *   so cross-language questions are expected to fail, and its "answers" are not AI output.
 *   A test-double report is never evidence of answer or retrieval quality.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createChatModel, createEmbeddingsProvider } from "../packages/ai/src/index.ts";
import { answerQuestion, createStorage, type AnswerEvent, type Services } from "../packages/core/src/index.ts";
import { createDatabase, defaultWorkspace, getDemoOrganization, listDocuments, withTenant } from "../packages/database/src/index.ts";
import { getConfig } from "../packages/shared/src/index.ts";

type Expected = { answerable: boolean; sources: { document: string; edition: "en" | "he"; page?: number }[]; mustContain: string[] };
type Question = { id: string; category: string; language: "en" | "he"; question: string; expected: Expected };

const root = path.resolve(import.meta.dirname, "..");
const config = getConfig();
const embeddings = createEmbeddingsProvider(config);
const chat = createChatModel(config);
if (!config.DATABASE_URL || !embeddings || !chat) throw new Error("DATABASE_URL, an embeddings provider and a chat model must be configured");
const live = embeddings.descriptor.kind === "live" || chat.descriptor.kind === "live";
if (live && !process.argv.includes("--yes")) {
  console.error("Real providers are configured: this run makes one paid chat call per question. Re-run with --yes to proceed.");
  process.exit(2);
}

const database = createDatabase(config.DATABASE_URL, { max: 3 });
const services: Services = {
  config, db: database.db, storage: createStorage(config), embeddings, chat,
  queue: { enqueueIngestion: async () => { throw new Error("the evaluation does not upload"); } },
};
const org = await getDemoOrganization(database.db);
const workspace = org && (await withTenant(database.db, org.id, (tx) => defaultWorkspace(tx, org.id)));
if (!org || !workspace) throw new Error("The demo organization is not seeded. Run: pnpm demo:seed");
const tenant = { organizationId: org.id, workspaceId: workspace.id };
const documents = (await withTenant(database.db, org.id, (tx) => listDocuments(tx, tenant))).filter((d) => d.status === "ready");
// "customer-support-handbook" + language → document id. The two editions share file names.
const idOf = new Map(documents.map((d) => [`${d.originalFilename.replace(/\.[a-z]+$/, "")}/${d.language}`, d.id]));

const questions = JSON.parse(await readFile(path.join(root, "samples/evaluation/questions.json"), "utf8")) as Question[];
const owner = { demoSessionId: `evaluation-${Date.now()}` };
const rows = [];
for (const q of questions) {
  const events: AnswerEvent[] = [];
  try {
    for await (const event of answerQuestion(services, tenant, owner, { question: q.question, locale: q.language, correlationId: `eval-${q.id}` })) events.push(event);
  } catch (error) {
    events.push({ type: "error", code: error instanceof Error ? error.message : "internal", messageId: null } as AnswerEvent);
  }
  const done = events.find((e) => e.type === "done");
  const text = events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("");
  const sources = done?.type === "done" ? done.sources : [];
  const answered = done?.type === "done" && done.answerStatus === "answered";
  const expectedIds = q.expected.sources.map((s) => ({ id: idOf.get(`${s.document}/${s.edition}`), page: s.page ?? null }));
  const found = expectedIds.map((e) => sources.some((s) => s.documentId === e.id && (e.page === null || s.pageNumber === e.page)));
  const evidence = `${text}\n${sources.map((s) => s.excerpt).join("\n")}`;
  rows.push({
    id: q.id,
    category: q.category,
    outcome: done?.type === "done" ? done.answerStatus : "error",
    // Answerable: was it answered with citations? Unanswerable: did the system decline?
    statusCorrect: q.expected.answerable ? answered : done?.type === "done" && done.answerStatus === "insufficient_evidence",
    expectedSourcesCited: q.expected.answerable ? found.filter(Boolean).length : null,
    expectedSources: q.expected.answerable ? found.length : null,
    allExpectedSourcesCited: q.expected.answerable ? found.every(Boolean) : null,
    factsInAnswer: q.expected.answerable ? q.expected.mustContain.every((fact) => text.includes(fact)) : null,
    factsInCitedPassages: q.expected.answerable ? q.expected.mustContain.every((fact) => evidence.includes(fact)) : null,
    citedDocuments: sources.map((s) => `${documents.find((d) => d.id === s.documentId)?.language}:${s.documentTitle}${s.pageNumber ? ` p.${s.pageNumber}` : ""}`),
  });
}

const rate = (list: typeof rows, pick: (r: (typeof rows)[number]) => boolean | null) => {
  const scored = list.filter((r) => pick(r) !== null);
  return scored.length ? `${scored.filter((r) => pick(r)).length}/${scored.length}` : "n/a";
};
const categories = [...new Set(rows.map((r) => r.category))];
const summary = categories.map((category) => {
  const list = rows.filter((r) => r.category === category);
  return {
    category,
    questions: list.length,
    statusCorrect: rate(list, (r) => r.statusCorrect),
    allExpectedSourcesCited: rate(list, (r) => r.allExpectedSourcesCited),
    factsInAnswer: rate(list, (r) => r.factsInAnswer),
    factsInCitedPassages: rate(list, (r) => r.factsInCitedPassages),
  };
});
const providers = {
  mode: live ? "REAL PROVIDERS" : "TEST DOUBLES (not AI; not evidence of quality)",
  chat: `${chat.descriptor.provider}/${chat.descriptor.modelId} (${chat.descriptor.kind})`,
  embeddings: `${embeddings.descriptor.provider}/${embeddings.descriptor.modelId} (${embeddings.descriptor.kind})`,
};
const name = live ? "evaluation-live" : "evaluation-test-doubles";
const out = path.join(root, "artifacts", "evaluation");
await mkdir(out, { recursive: true });
await writeFile(path.join(out, `${name}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), providers, documents: documents.length, summary, rows }, null, 2));
const table = [
  "| Category | Questions | Correct outcome | All expected sources cited | Facts in answer | Facts in cited passages |",
  "|---|---|---|---|---|---|",
  ...summary.map((s) => `| ${s.category} | ${s.questions} | ${s.statusCorrect} | ${s.allExpectedSourcesCited} | ${s.factsInAnswer} | ${s.factsInCitedPassages} |`),
].join("\n");
await writeFile(
  path.join(out, `${name}.md`),
  `# Evaluation run: ${providers.mode}\n\n- Chat: ${providers.chat}\n- Embeddings: ${providers.embeddings}\n- Documents: ${documents.length}\n- Generated: ${new Date().toISOString()}\n\n` +
    (live ? "" : "This run used deterministic test doubles. It shows that the pipeline runs end to end; it says nothing about answer quality, and the word-matching embedding double cannot retrieve across languages.\n\n") +
    `${table}\n\n"Correct outcome" means answered with at least one citation for an answerable question, and a refusal for an unanswerable one.\n`,
);
console.log(`${providers.mode}\n${table}\nreport: artifacts/evaluation/${name}.md`);
await database.close();
process.exit(0);
