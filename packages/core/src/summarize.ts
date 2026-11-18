import { buildSummaryRequest, parseSummaryReply, type SummaryPassage } from "@hks/ai";
import {
  getDocument,
  getDocumentSummary,
  listDocumentChunks,
  recordUsage,
  saveDocumentSummary,
  withTenant,
  type StoredSummary,
  type TenantContext,
} from "@hks/database";
import { AppError, log } from "@hks/shared";
import { reserveAiBudget, settleAiBudget } from "./budget.ts";
import type { Services } from "./services.ts";

export type SummaryView = { locale: "he" | "en"; createdAt: Date; pipelineMode: "live" | "sample"; content: StoredSummary };

const locationOf = (chunk: { pageNumber: number | null; sectionPath: string[] | null }) =>
  chunk.pageNumber ? `page ${chunk.pageNumber}` : chunk.sectionPath?.length ? `section ${chunk.sectionPath.join(" > ")}` : null;

export async function readSummary(services: Services, ctx: TenantContext, documentId: string, locale: "he" | "en"): Promise<SummaryView | null> {
  const row = await withTenant(services.db, ctx.organizationId, (tx) => getDocumentSummary(tx, ctx, documentId, locale));
  return row ? { locale: row.locale, createdAt: row.createdAt, pipelineMode: row.providerKind === "live" ? "live" : "sample", content: row.content } : null;
}

/**
 * Marks the most important passages of ONE document and summarizes it.
 *
 * Unlike answering, nothing is retrieved: the model reads every passage of the document, so the
 * summary covers all of it. A document too long for one call is refused rather than cut short.
 * Every quote the model returns is located in the passage it names; a quote that is not there
 * word for word is dropped, and a point left without any quote is dropped with it. What is
 * saved can therefore always be shown as a highlight in the document's own text.
 */
export async function summarizeDocument(
  services: Services,
  ctx: TenantContext,
  input: { documentId: string; locale: "he" | "en"; userId: string | null; correlationId: string; signal?: AbortSignal },
): Promise<SummaryView> {
  const { config, db, chat } = services;
  if (!chat) throw new AppError("provider_not_configured", "Summarizing is not configured");

  const loaded = await withTenant(db, ctx.organizationId, async (tx) => {
    const document = await getDocument(tx, ctx, input.documentId);
    if (!document || document.status !== "ready") return null;
    return { document, chunks: await listDocumentChunks(tx, ctx, input.documentId) };
  });
  if (!loaded || loaded.chunks.length === 0) throw new AppError("not_found");
  const chunks = [...loaded.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);

  const inputTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0) + 1200;
  if (inputTokens > config.SUMMARY_MAX_INPUT_TOKENS) {
    throw new AppError("payload_too_large", "The document is too long to summarize in one pass");
  }
  const passages: SummaryPassage[] = chunks.map((chunk, i) => ({ label: `P${i + 1}`, location: locationOf(chunk), text: chunk.text }));
  const chunkIdOf = new Map(chunks.map((chunk, i) => [`P${i + 1}`, chunk.id]));
  const request = buildSummaryRequest({ title: loaded.document.title, passages, language: input.locale, maxOutputTokens: config.SUMMARY_MAX_OUTPUT_TOKENS });

  const reservation = await reserveAiBudget(services, ctx.organizationId, { inputTokens, outputTokens: config.SUMMARY_MAX_OUTPUT_TOKENS }, "summarizing this document");
  const spend = { inputTokens: 0, outputTokens: 0 };
  let reply = "";
  let stopReason: string | null = null;
  try {
    spend.inputTokens = inputTokens; // charged from the first byte sent, unless the provider reports otherwise
    for await (const event of chat.streamAnswer(request, input.signal)) {
      if (event.type === "text") reply += event.text;
      else {
        stopReason = event.stopReason;
        spend.inputTokens = event.inputTokens ?? inputTokens;
        spend.outputTokens = event.outputTokens ?? Math.ceil(reply.length / 2);
      }
    }
  } finally {
    await settleAiBudget(services, reservation, spend);
    await withTenant(db, ctx.organizationId, (tx) =>
      recordUsage(tx, {
        organizationId: ctx.organizationId, workspaceId: ctx.workspaceId, userId: input.userId, kind: "document_summary",
        provider: chat.descriptor.provider, modelId: chat.descriptor.modelId, providerKind: chat.descriptor.kind,
        inputTokens: spend.inputTokens, outputTokens: spend.outputTokens, units: 1, documentId: input.documentId, correlationId: input.correlationId,
      }),
    ).catch(() => {});
  }

  if (stopReason === "max_tokens") throw new AppError("provider_error", "The summary was cut off before it was complete");
  const draft = parseSummaryReply(reply, passages);
  if (!draft || draft.points.length === 0) {
    log("warn", "summary.unusable", { documentId: input.documentId, parsed: Boolean(draft), correlationId: input.correlationId });
    throw new AppError("provider_error", "No summary point could be matched to the document's text");
  }
  const content: StoredSummary = {
    overview: draft.overview,
    points: draft.points.map((point) => ({
      text: point.text,
      highlights: point.quotes.map((quote) => ({ chunkId: chunkIdOf.get(quote.label)!, start: quote.start, end: quote.end })),
    })),
    rejectedQuotes: draft.rejectedQuotes,
    rejectedPoints: draft.rejectedPoints,
  };
  const row = await withTenant(db, ctx.organizationId, async (tx) => {
    // The document may have been deleted while the model was reading it.
    if (!(await getDocument(tx, ctx, input.documentId))) throw new AppError("not_found");
    return saveDocumentSummary(tx, ctx, {
      documentId: input.documentId, locale: input.locale, provider: chat.descriptor.provider, modelId: chat.descriptor.modelId,
      providerKind: chat.descriptor.kind, content, createdByUserId: input.userId,
    });
  });
  log("info", "summary.saved", { documentId: input.documentId, points: content.points.length, rejectedQuotes: content.rejectedQuotes, correlationId: input.correlationId });
  return { locale: row.locale, createdAt: row.createdAt, pipelineMode: row.providerKind === "live" ? "live" : "sample", content: row.content };
}
