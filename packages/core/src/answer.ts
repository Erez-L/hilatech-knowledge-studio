import {
  buildGroundedRequest,
  CitationStreamFilter,
  estimateTokens,
  HISTORY_QUERY_MAX_CHARS,
  historyForPrompt,
  historyQuery,
  mergeRetrieval,
  pairTurns,
  pipelineModeOf,
  type EmbeddingsProvider,
  type HistoryTurn,
  type PromptSource,
} from "@hks/ai";
import {
  addAssistantMessage,
  addUserMessage,
  createConversation,
  ensureActiveEmbeddingIndex,
  getConversation,
  listRecentMessages,
  recordUsage,
  searchChunks,
  withTenant,
  type Locale,
  type NewCitation,
  type Owner,
  type RetrievedChunk,
  type TenantContext,
} from "@hks/database";
import { AppError, isAppError, log } from "@hks/shared";
import { reserveAiBudget, settleAiBudget } from "./budget.ts";
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
  /** Marks the position of a citation in the text stream (every occurrence, validated). */
  | { type: "marker"; label: string }
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
  /** Answer only from these documents of the workspace. Absent or empty: the whole workspace. */
  documentIds?: string[];
};

const MAX_QUESTION_CHARS = 2000;
const EXCERPT_CHARS = 900;
/** Characters of one earlier turn as the model sees it, at most (see historyForPrompt). */
const HISTORY_TURN_CHARS = 1200;

/**
 * Answers a question from the caller's workspace documents.
 *
 * Retrieval is scoped to one workspace before ranking. The model sees only
 * request-local labels (S1…Sn); every citation it writes is checked against
 * the chunks actually retrieved before it reaches the client or the database.
 * When no retrieved passage clears the evidence threshold the model is not
 * called at all, and the answer is recorded as insufficient evidence.
 */
/** Stop reasons (Anthropic and Bedrock Converse spellings) after which the text must not be presented as a finished answer. */
const INCOMPLETE_STOP_REASONS: ReadonlySet<string> = new Set([
  "max_tokens", "refusal", "model_context_window_exceeded", "content_filtered", "guardrail_intervened",
]);

export async function* answerQuestion(
  services: Services,
  ctx: TenantContext,
  owner: Owner,
  input: AskInput,
): AsyncGenerator<AnswerEvent> {
  const { config } = services;
  // Reserve the most this question can cost before any provider is called: the question itself
  // (query embedding), a full context window of passages, and a full-length reply. The reservation
  // is replaced by actual usage when the answer ends, however it ends.
  const questionTokens = estimateTokens(input.question.slice(0, MAX_QUESTION_CHARS));
  const contextTokens = Math.ceil((config.RAG_MAX_CONTEXT_CHUNKS * config.CHUNK_MAX_CHARS) / 3) + 600;
  // A follow-up also embeds a second query with the earlier questions, and sends a short
  // transcript of the earlier turns to the model. Reserved at its upper bound; settled to actual use.
  const historyTokens = input.conversationId && config.RAG_HISTORY_TURNS > 0
    ? Math.ceil(HISTORY_QUERY_MAX_CHARS / 2) + Math.ceil((config.RAG_HISTORY_TURNS * HISTORY_TURN_CHARS) / 2)
    : 0;
  const reservation = await reserveAiBudget(
    services, ctx.organizationId,
    { inputTokens: questionTokens * 2 + historyTokens + contextTokens, outputTokens: config.LLM_MAX_OUTPUT_TOKENS }, "another question",
  );
  const spend: Spend = { inputTokens: 0, outputTokens: 0 };
  try {
    yield* answerWithinBudget(services, ctx, owner, input, spend, { question: questionTokens, reserved: reservation });
  } finally {
    await settleAiBudget(services, reservation, spend);
  }
}

/** Embeds the question (and the follow-up context query) in one request when the provider can. */
async function embedQuestions(embeddings: EmbeddingsProvider, texts: string[], signal?: AbortSignal): Promise<number[][]> {
  if (texts.length > 1 && embeddings.embedQueries) {
    const vectors = await embeddings.embedQueries(texts, signal);
    if (vectors.length !== texts.length) throw new AppError("embedding_failed", "Unexpected number of query embeddings");
    return vectors;
  }
  const vectors: number[][] = [];
  for (const text of texts) vectors.push(await embeddings.embedQuery(text, signal));
  return vectors;
}

/** Tokens to charge for one question; updated as the answer progresses. */
type Spend = { inputTokens: number; outputTokens: number };

async function* answerWithinBudget(
  services: Services,
  ctx: TenantContext,
  owner: Owner,
  input: AskInput,
  spend: Spend,
  budget: { question: number; reserved: { inputTokens: number; outputTokens: number } },
): AsyncGenerator<AnswerEvent> {
  const { config, db, chat, embeddings } = services;
  if (!chat || !embeddings) throw new AppError("provider_not_configured", "Answering is not configured");
  const question = input.question.trim();
  if (!question) throw new AppError("validation", "Enter a question");
  if (question.length > MAX_QUESTION_CHARS) throw new AppError("validation", "The question is too long");

  const pipelineMode = pipelineModeOf(chat, embeddings);
  const index = await ensureActiveEmbeddingIndex(db, embeddings.descriptor);
  const usageBase = {
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId,
    userId: "userId" in owner ? owner.userId : null,
    demoSessionId: "demoSessionId" in owner ? owner.demoSessionId : null,
    correlationId: input.correlationId,
  };

  // 1. Conversation, its last turns (for a follow-up question) and the user's message.
  const { conversationId, userMessageId, history } = await withTenant(db, ctx.organizationId, async (tx) => {
    const conversation = input.conversationId
      ? await getConversation(tx, ctx, owner, input.conversationId)
      : await createConversation(tx, ctx, owner, { title: question.slice(0, 80), locale: input.locale });
    if (!conversation) throw new AppError("not_found", "Conversation not found");
    const turns = config.RAG_HISTORY_TURNS;
    const earlier: HistoryTurn[] = input.conversationId && turns > 0
      ? pairTurns(await listRecentMessages(tx, ctx, conversation.id, turns * 2 + 2), turns)
      : [];
    const message = await addUserMessage(tx, ctx, { conversationId: conversation.id, content: question, correlationId: input.correlationId });
    return { conversationId: conversation.id, userMessageId: message.id, history: earlier };
  });
  yield { type: "start", conversationId, userMessageId, pipelineMode };

  // 2. Retrieval, scoped to this workspace. A follow-up question runs a second query that also
  // carries the earlier questions, so "and the second one?" still finds the passages it is about.
  let candidates: RetrievedChunk[];
  const fitsEmbedding = (text: string) =>
    !embeddings.estimateTokens || !embeddings.maxTokensPerText || embeddings.estimateTokens(text) <= embeddings.maxTokensPerText;
  const contextQuery = historyQuery(question, history, fitsEmbedding);
  const queryTokens = budget.question + (contextQuery ? estimateTokens(contextQuery) : 0);
  try {
    // The query embedding(s), in one request when the provider supports it.
    spend.inputTokens = queryTokens;
    let queryVector: number[] | undefined;
    let contextVector: number[] | undefined;
    try {
      [queryVector, contextVector] = await embedQuestions(embeddings, contextQuery ? [question, contextQuery] : [question], input.signal);
    } catch (error) {
      // The history query is a bonus: if embedding it fails, answer from the question alone.
      if (!contextQuery || input.signal?.aborted) throw error;
      log("warn", "answer.history_query_failed", { correlationId: input.correlationId, code: isAppError(error) ? error.code : "internal" });
      [queryVector] = await embedQuestions(embeddings, [question], input.signal);
      contextVector = undefined;
    }
    candidates = await withTenant(db, ctx.organizationId, async (tx) => {
      await recordUsage(tx, {
        ...usageBase, kind: "query_embedding", provider: embeddings.descriptor.provider,
        modelId: embeddings.descriptor.modelId, providerKind: embeddings.descriptor.kind, units: contextVector ? 2 : 1,
      });
      const search = { embeddingIndexId: index.id, topK: config.RAG_TOP_K, documentIds: input.documentIds };
      const primary = await searchChunks(tx, ctx, { ...search, queryVector: queryVector! });
      if (!contextVector) return primary;
      // A question that finds good evidence by itself keeps its own passages first (a new subject).
      const standsAlone = (primary[0]?.similarity ?? -1) >= config.RAG_EVIDENCE_MIN_SIMILARITY;
      return mergeRetrieval(primary, await searchChunks(tx, ctx, { ...search, queryVector: contextVector }), config.RAG_TOP_K, standsAlone);
    });
  } catch (error) {
    log("error", "answer.retrieval_failed", { correlationId: input.correlationId, code: isAppError(error) ? error.code : "internal" });
    yield { type: "error", code: isAppError(error) ? error.code : "internal", messageId: null };
    return;
  }

  // 3. Evidence selection: relevance floor, then a context budget.
  const relevant = candidates.filter((c) => c.similarity >= config.RAG_MIN_SIMILARITY);
  const hasEvidence = relevant.some((c) => c.similarity >= config.RAG_EVIDENCE_MIN_SIMILARITY);
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
  const request = buildGroundedRequest({ question, sources, maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS, history: historyForPrompt(history) });
  const filter = new CitationStreamFilter(new Set(byLabel.keys()));
  const announced = new Set<string>();
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const forward = function* (events: ReturnType<CitationStreamFilter["push"]>): Generator<AnswerEvent> {
    for (const event of events) {
      if (event.type === "text") yield { type: "text", text: event.text };
      else {
        if (!announced.has(event.label)) {
          announced.add(event.label);
          yield { type: "citation", source: view(event.label, announced.size) };
        }
        yield { type: "marker", label: event.label };
      }
    }
  };

  // From here the chat model may charge for the whole request even if it fails midway: assume the
  // full reservation until the model reports what it actually used.
  spend.inputTokens = budget.reserved.inputTokens;
  spend.outputTokens = budget.reserved.outputTokens;
  try {
    for await (const event of chat.streamAnswer(request, input.signal)) {
      if (input.signal?.aborted) break;
      if (event.type === "text") yield* forward(filter.push(event.text));
      else {
        inputTokens = event.inputTokens;
        outputTokens = event.outputTokens;
        if (event.inputTokens !== null && event.outputTokens !== null) {
          spend.inputTokens = queryTokens + event.inputTokens;
          spend.outputTokens = event.outputTokens;
        }
        // A reply that was cut off, refused or filtered is not a complete answer, even though the request succeeded.
        if (event.stopReason && INCOMPLETE_STOP_REASONS.has(event.stopReason)) {
          throw new AppError("provider_error", `The model stopped early (${event.stopReason})`);
        }
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
