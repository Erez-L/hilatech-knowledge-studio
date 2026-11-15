/**
 * LIVE TEST - the full flow with REAL providers (paid): upload -> BullMQ worker -> extraction ->
 * chunking -> Cohere embeddings on Bedrock -> pgvector -> retrieval -> grounded answer from the
 * configured chat model -> persistence. Skipped unless LIVE_PIPELINE=1.
 *
 * Needs PostgreSQL with pgvector and Redis (DATABASE_URL, DATABASE_MIGRATION_URL, REDIS_URL).
 * Refuses to run unless the database name contains "test" or "verify".
 * At most 3 chat calls. See docs/REAL_PROVIDER_VERIFICATION.md, steps 8 to 10.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { usageSince, withTenant, type DocumentRow } from "../../packages/database/src/index.ts";
import {
  ask,
  createLiveHarness,
  createTenant,
  formatCandidates,
  liveGate,
  liveSuite,
  Observations,
  pageInRange,
  PIPELINE_REQUIRED_ENV,
  readSample,
  savedAnswer,
  uploadAndWait,
  vectorStats,
  type LiveHarness,
  type Tenant,
} from "./helpers.ts";

const gate = liveGate(
  "Full pipeline with real providers",
  "LIVE_PIPELINE",
  PIPELINE_REQUIRED_ENV,
  'The database name must contain "test" or "verify".',
);

const SAMPLES = ["customer-support-handbook.pdf", "refund-and-cancellation-policy.pdf"];
const ANSWERABLE = "Priority 1 tickets receive a first response within how many minutes during business hours?";
const UNANSWERABLE = "What is the boiling point of tungsten in kelvin?";

liveSuite(gate, () => {
  const observations = new Observations("pipeline");
  let harness: LiveHarness;
  let tenant: Tenant;
  const documents: DocumentRow[] = [];
  const titles = new Map<string, string>();

  beforeAll(async () => {
    harness = await createLiveHarness({ chatCalls: 3, embeddingCalls: 40, embeddingTexts: 2500 });
    tenant = await createTenant(harness.database, "live-pipeline");
    observations.record("providers", { chat: harness.chat.descriptor, embeddings: harness.embeddings.descriptor });
    observations.record("thresholds", {
      RAG_TOP_K: harness.config.RAG_TOP_K,
      RAG_MAX_CONTEXT_CHUNKS: harness.config.RAG_MAX_CONTEXT_CHUNKS,
      RAG_MIN_SIMILARITY: harness.config.RAG_MIN_SIMILARITY,
      RAG_EVIDENCE_MIN_SIMILARITY: harness.config.RAG_EVIDENCE_MIN_SIMILARITY,
    });
  });

  afterAll(async () => {
    await harness?.close();
    await observations.write();
  });

  it("ingests two sample documents to Ready with live 1024-dimensional vectors", async () => {
    for (const name of SAMPLES) {
      const sample = await readSample(name);
      const document = await uploadAndWait(harness, tenant, sample);
      observations.record(`ingested ${sample.file}`, {
        status: document.status, failureCode: document.failureCode, pages: document.pageCount, chunks: document.chunkCount, language: document.language,
      });
      expect(document.status, `ingestion of ${name} ended as ${document.status} (${document.failureCode ?? "no code"})`).toBe("ready");
      documents.push(document);
      titles.set(document.id, document.title);

      const stats = await vectorStats(harness.database, tenant, document.id);
      observations.record(`vectors of ${name}`, stats);
      // Exactly one index holds this document's vectors, and it is the live one - never the test double's.
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        kind: "live",
        status: "active",
        provider: "bedrock-cohere",
        model_id: harness.config.EMBEDDINGS_MODEL_ID,
        n: document.chunkCount,
        min_dims: 1024,
        max_dims: 1024,
      });
    }
  });

  it("answers an answerable question, cites the right page, and saves pipeline_mode = 'live'", async () => {
    expect(documents).toHaveLength(SAMPLES.length);
    const result = await ask(harness, tenant, ANSWERABLE);
    expect(result.error, `answer failed with ${result.error?.code}`).toBeUndefined();
    const saved = await savedAnswer(harness, tenant, result.start!.conversationId, titles);
    console.info(`[live:pipeline] candidates for the ANSWERABLE question (rank, similarity, label, document, location):\n${formatCandidates(saved.candidates)}`);
    observations.record("answerable.candidates", saved.candidates);
    observations.record("answerable.answer", { text: result.text, raw: result.rawModelText, status: result.done?.answerStatus, sources: result.done?.sources.map((s) => ({ label: s.label, document: s.documentTitle, page: s.pageNumber, similarity: s.similarity })) });

    expect(result.start!.pipelineMode).toBe("live");
    expect(result.modelCalled).toBe(true);
    expect(result.done).toMatchObject({ status: "complete", answerStatus: "answered" });
    expect(result.text).toContain("30");
    expect(result.text).not.toMatch(/\[S\d+\]/); // markers travel as citation events
    // Every citation refers to a passage that was in the prompt.
    for (const label of result.citedLabels) expect(result.suppliedLabels).toContain(label);
    // The fact is on page 7 of the handbook. A passage can span pages, and a citation shows only the
    // passage's FIRST page, so the hard check is that a cited passage covers page 7 and contains the
    // sentence; whether the page shown to the user is exactly 7 is recorded as an observation.
    // Matched by document ID: titles are display text derived from the file name and may change.
    const fromHandbook = result.done!.sources.filter((s) => s.documentId === documents[0]!.id);
    const covering = fromHandbook.filter((s) => {
      const passage = saved.passageOf(s.chunkId);
      return passage !== null && pageInRange(7, passage) && passage.text.includes("first response within 30 minutes");
    });
    expect(covering.length, "no cited passage covers page 7 of the handbook and contains the fact").toBeGreaterThan(0);
    observations.soft(
      "the page shown in the citation is exactly the page that holds the fact (7)",
      covering.some((s) => s.pageNumber === 7),
      covering.map((s) => ({ shownPage: s.pageNumber, passagePages: saved.passageOf(s.chunkId) && [saved.passageOf(s.chunkId)!.pageNumber, saved.passageOf(s.chunkId)!.pageEnd] })),
    );
    for (const source of result.done!.sources) expect(titles.has(source.documentId)).toBe(true);

    expect(saved.message).toMatchObject({ status: "complete", answerStatus: "answered", pipelineMode: "live", llmProvider: harness.chat.descriptor.provider, llmModelId: harness.chat.descriptor.modelId });
    expect(saved.message.inputTokens).toBeGreaterThan(0);
    expect(saved.message.outputTokens).toBeGreaterThan(0);
    expect(saved.citations.map((c) => c.chunkId).sort()).toEqual(result.done!.sources.map((s) => s.chunkId).sort());
  });

  it("reports insufficient evidence for a question the documents do not answer", async () => {
    expect(documents).toHaveLength(SAMPLES.length);
    const result = await ask(harness, tenant, UNANSWERABLE);
    expect(result.error, `answer failed with ${result.error?.code}`).toBeUndefined();
    const saved = await savedAnswer(harness, tenant, result.start!.conversationId, titles);
    console.info(`[live:pipeline] candidates for the UNANSWERABLE question (rank, similarity, label, document, location):\n${formatCandidates(saved.candidates)}`);
    observations.record("unanswerable.candidates", saved.candidates);
    // Two different mechanisms can produce the refusal; calibration needs to know which one did.
    observations.record("unanswerable.refusedBy", result.modelCalled ? "the model (INSUFFICIENT_EVIDENCE marker)" : "the similarity thresholds (model not called)");
    observations.record("unanswerable.raw", result.rawModelText);

    expect(result.done).toMatchObject({ status: "complete", answerStatus: "insufficient_evidence", sources: [] });
    expect(result.citedLabels).toEqual([]);
    expect(saved.message).toMatchObject({ answerStatus: "insufficient_evidence", pipelineMode: "live", content: "" });
    expect(saved.citations).toEqual([]);
  });

  it("recorded live usage and stayed within the call caps", async () => {
    const usage = await withTenant(harness.database.db, tenant.organizationId, (tx) => usageSince(tx, tenant.organizationId, new Date(Date.now() - 3_600_000)));
    observations.record("usageRecordedForTenant", usage);
    observations.record("calls", { chat: harness.chat.calls.length, embeddingCalls: harness.embeddings.calls, embeddingTexts: harness.embeddings.texts });
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(harness.chat.calls.length).toBeLessThanOrEqual(3);
  });
});
