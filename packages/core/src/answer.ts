import { buildGroundedRequest, CitationStreamFilter, pipelineModeOf, type PromptSource } from "@hks/ai";
import {
  addAssistantMessage,
  addUserMessage,
  createConversation,
  ensureActiveEmbeddingIndex,
  getConversation,
  recordUsage,
  searchChunks,
  usageSince,
  withTenant,
  type Locale,
  type NewCitation,
  type Owner,
  type RetrievedChunk,
  type TenantContext,
} from "@hks/database";
import { AppError, isAppError, log } from "@hks/shared";
import type { Services } from "./services.ts";

export type SourceView = {
  label: string;
  ordinal: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  fileType: string;
  pageNumber: number | null;
  sectionPath: string[] | null;
  excerpt: string;
  similarity: number;
};

export type AnswerEvent =
  | { type: "start"; conversationId: string; userMessageId: string; pipelineMode: "live" | "sample" }
  | { type: "text"; text: string }
  /** Emitted the first time a source is cited. The label was validated against the retrieved set. */
  | { type: "citation"; source: SourceView }
  | {
      type: "done";
      messageId: string;
      status: "complete" | "cancelled";
      answerStatus: "answered" | "insufficient_evidence" | "uncited";
      sources: SourceView[];
    }
  | { type: "error"; code: string; messageId: string | null };

export type AskInput = {
  conversationId?: string;
  question: string;
  locale: Locale;
  correlationId: string;
  signal?: AbortSignal;
};

const MAX_QUESTION_CHARS = 2000;
const EXCERPT_CHARS = 900;

/**
 * Answers a question from the caller's workspace documents.
 *
 * Retrieval is scoped to one workspace before ranking. The model sees only
 * request-local labels (S1…Sn); every citation it writes is checked against
 * the chunks actually retrieved before it reaches the client or the database.
 * When no retrieved passage clears the evidence threshold the model is not
 * called at all, and the answer is recorded as insufficient evidence.
 */
export async function* answerQuestion(
  services: Services,
  ctx: TenantContext,
  owner: Owner,
  input: AskInput,
): AsyncGenerator<AnswerEvent> {
  const { config, db, chat, embeddings } = services;
  if (!chat || !embeddings) throw new AppError("provider_not_configured", "Answering is not configured");
  const question = input.question.trim();
  if (!question) throw new AppError("validation", "Enter a question");
  if (question.length > MAX_QUESTION_CHARS) throw new AppError("validation", "The question is too long");

  // Usage budget (real providers only; test doubles cost nothing and are excluded).
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const used = await withTenant(db, ctx.organizationId, (tx) => usageSince(tx, ctx.organizationId, startOfDay));
  if (used.inputTokens >= config.BUDGET_DAILY_INPUT_TOKENS || used.outputTokens >= config.BUDGET_DAILY_OUTPUT_TOKENS) {
    throw new AppError("budget_exceeded", "The daily usage budget for this organization has been reached");
  }

  const pipelineMode = pipelineModeOf(chat, embeddings);
  const index = await ensureActiveEmbeddingIndex(db, embeddings.descriptor);
  const usageBase = {
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId,
    userId: "userId" in owner ? owner.userId : null,
    demoSessionId: "demoSessionId" in owner ? owner.demoSessionId : null,
    correlationId: input.correlationId,
  };

  // 1. Conversation and the user's message.
  const { conversationId, userMessageId } = await withTenant(db, ctx.organizationId, async (tx) => {
    const conversation = input.conversationId
      ? await getConversation(tx, ctx, owner, input.conversationId)
      : await createConversation(tx, ctx, owner, { title: question.slice(0, 80), locale: input.locale });
    if (!conversation) throw new AppError("not_found", "Conversation not found");
    const message = await addUserMessage(tx, ctx, { conversationId: conversation.id, content: question, correlationId: input.correlationId });
    return { conversationId: conversation.id, userMessageId: message.id };
  });
  yield { type: "start", conversationId, userMessageId, pipelineMode };

  // 2. Retrieval, scoped to this workspace.
  let candidates: RetrievedChunk[];
  try {
    const queryVector = await embeddings.embedQuery(question, input.signal);
    candidates = await withTenant(db, ctx.organizationId, async (tx) => {
      await recordUsage(tx, {
        ...usageBase, kind: "query_embedding", provider: embeddings.descriptor.provider,
        modelId: embeddings.descriptor.modelId, providerKind: embeddings.descriptor.kind, units: 1,
      });
      return searchChunks(tx, ctx, { embeddingIndexId: index.id, queryVector, topK: config.RAG_TOP_K });
    });
  } catch (error) {
    log("error", "answer.retrieval_failed", { correlationId: input.correlationId, code: isAppError(error) ? error.code : "internal" });
    yield { type: "error", code: isAppError(error) ? error.code : "internal", messageId: null };
    return;
  }

  // 3. Evidence selection: relevance floor, then a context budget.
  const relevant = candidates.filter((c) => c.similarity >= config.RAG_MIN_SIMILARITY);
  const hasEvidence = relevant.length > 0 && relevant[0]!.similarity >= config.RAG_EVIDENCE_MIN_SIMILARITY;
  const selected = hasEvidence ? relevant.slice(0, config.RAG_MAX_CONTEXT_CHUNKS) : [];
  const byLabel = new Map<string, RetrievedChunk>(selected.map((chunk, i) => [`S${i + 1}`, chunk]));
  const labelOf = new Map<string, string>([...byLabel].map(([label, chunk]) => [chunk.chunkId, label]));
  const retrieval = {
    topK: config.RAG_TOP_K,
    minSimilarity: config.RAG_MIN_SIMILARITY,
    evidenceMinSimilarity: config.RAG_EVIDENCE_MIN_SIMILARITY,
    candidates: candidates.map((c) => ({ chunkId: c.chunkId, label: labelOf.get(c.chunkId) ?? null, similarity: Number(c.similarity.toFixed(4)) })),
  };

  const view = (label: string, ordinal: number): SourceView => {
    const chunk = byLabel.get(label)!;
    return {
      label, ordinal, chunkId: chunk.chunkId, documentId: chunk.documentId, documentTitle: chunk.documentTitle,
      fileType: chunk.fileType, pageNumber: chunk.pageNumber, sectionPath: chunk.sectionPath,
      excerpt: chunk.text.slice(0, EXCERPT_CHARS), similarity: chunk.similarity,
    };
  };

  const save = (fields: {
    content: string; status: "complete" | "cancelled" | "failed"; answerStatus: "answered" | "insufficient_evidence" | "uncited" | null;
    inputTokens: number | null; outputTokens: number | null; cited: string[]; errorCode?: string;
  }) =>
    withTenant(db, ctx.organizationId, async (tx) => {
      const citations: NewCitation[] = fields.cited.map((label, i) => {
        const source = view(label, i + 1);
        return {
          label, ordinal: i + 1, chunkId: source.chunkId, documentId: source.documentId, documentTitle: source.documentTitle,
          pageNumber: source.pageNumber, sectionPath: source.sectionPath, excerpt: source.excerpt, similarity: source.similarity,
        };
      });
      const saved = await addAssistantMessage(tx, ctx, {
        conversationId, content: fields.content, status: fields.status, answerStatus: fields.answerStatus, pipelineMode,
        llmProvider: chat.descriptor.provider, llmModelId: chat.descriptor.modelId, embeddingIndexId: index.id,
        inputTokens: fields.inputTokens, outputTokens: fields.outputTokens, retrieval,
        errorCode: fields.errorCode ?? null, correlationId: input.correlationId, citations,
      });
      if (fields.inputTokens !== null || fields.outputTokens !== null) {
        await recordUsage(tx, {
          ...usageBase, kind: "chat_completion", provider: chat.descriptor.provider, modelId: chat.descriptor.modelId,
          providerKind: chat.descriptor.kind, inputTokens: fields.inputTokens ?? 0, outputTokens: fields.outputTokens ?? 0,
          messageId: saved.message.id,
        });
      }
      return saved.message.id;
    });

  // 4. No passage is relevant enough: do not ask the model to improvise.
  if (!hasEvidence) {
    const messageId = await save({ content: "", status: "complete", answerStatus: "insufficient_evidence", inputTokens: null, outputTokens: null, cited: [] });
    yield { type: "done", messageId, status: "complete", answerStatus: "insufficient_evidence", sources: [] };
    return;
  }

  // 5. Grounded generation, streamed through the citation filter.
  const sources: PromptSource[] = [...byLabel].map(([label, chunk]) => ({
    label,
    documentTitle: chunk.documentTitle,
    location: chunk.pageNumber ? `page ${chunk.pageNumber}` : chunk.sectionPath?.length ? `section ${chunk.sectionPath.join(" > ")}` : null,
    text: chunk.text,
  }));
  const request = buildGroundedRequest({ question, sources, maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS });
  const filter = new CitationStreamFilter(new Set(byLabel.keys()));
  const announced = new Set<string>();
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const forward = function* (events: ReturnType<CitationStreamFilter["push"]>): Generator<AnswerEvent> {
    for (const event of events) {
      if (event.type === "text") yield { type: "text", text: event.text };
      else if (!announced.has(event.label)) {
        announced.add(event.label);
        yield { type: "citation", source: view(event.label, announced.size) };
      }
    }
  };

  try {
    for await (const event of chat.streamAnswer(request, input.signal)) {
      if (input.signal?.aborted) break;
      if (event.type === "text") yield* forward(filter.push(event.text));
      else {
        inputTokens = event.inputTokens;
        outputTokens = event.outputTokens;
      }
    }
  } catch (error) {
    const code = isAppError(error) ? error.code : "internal";
    log("error", "answer.generation_failed", { correlationId: input.correlationId, code });
    const messageId = await save({ content: filter.content, status: "failed", answerStatus: null, inputTokens, outputTokens, cited: filter.citedLabels, errorCode: code });
    yield { type: "error", code, messageId };
    return;
  }

  const cancelled = Boolean(input.signal?.aborted);
  if (!cancelled) yield* forward(filter.end());
  const cited = filter.citedLabels;
  const answerStatus = filter.insufficient ? "insufficient_evidence" : cited.length === 0 ? "uncited" : "answered";
  const messageId = await save({
    content: filter.insufficient ? "" : filter.content,
    status: cancelled ? "cancelled" : "complete",
    answerStatus: cancelled && !filter.content ? null : answerStatus,
    inputTokens,
    outputTokens,
    cited: filter.insufficient ? [] : cited,
  });
  yield {
    type: "done",
    messageId,
    status: cancelled ? "cancelled" : "complete",
    answerStatus,
    sources: filter.insufficient ? [] : cited.map((label, i) => view(label, i + 1)),
  };
}
