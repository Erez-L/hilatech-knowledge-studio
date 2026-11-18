/**
 * Provider contracts. The rest of the application depends only on these
 * interfaces; which vendor sits behind them is configuration.
 */

/** `test_double` marks a deterministic stand-in. Its output is never presented as live AI. */
export type ProviderKind = "live" | "test_double";

export type ProviderDescriptor = {
  provider: string;
  modelId: string;
  kind: ProviderKind;
};

export type EmbeddingsDescriptor = ProviderDescriptor & { dimensions: number };

export interface EmbeddingsProvider {
  readonly descriptor: EmbeddingsDescriptor;
  /** Maximum characters accepted per text; longer input is rejected, not silently truncated. */
  readonly maxCharsPerText: number;
  /**
   * Token limit per text, when the model has one, with a CONSERVATIVE local estimate of a text's
   * token count. The estimate is not the provider's tokenizer: callers size text with it and must
   * still be ready for the provider to reject a text (see EmbeddingInputTooLongError).
   */
  readonly maxTokensPerText?: number;
  estimateTokens?(text: string): number;
  /** Embeds passages for storage. Result order matches input order. */
  embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  /** Embeds a question for retrieval (models may treat queries differently from passages). */
  embedQuery(text: string, signal?: AbortSignal): Promise<number[]>;
}

export type ChatRequest = {
  /** Application instructions. Never contains document text. */
  system: string;
  /** The user turn: the question plus the evidence block (documents are untrusted data). */
  user: string;
  maxOutputTokens: number;
};

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "done"; inputTokens: number | null; outputTokens: number | null; stopReason: string | null };

export interface ChatModelProvider {
  readonly descriptor: ProviderDescriptor;
  /** Streams the answer as text deltas, ending with exactly one `done` event. */
  streamAnswer(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>;
}

export type PageReading = {
  /** The text as printed on the page; empty when the page has none. */
  text: string;
  /** True when the model stopped at its output limit, so the end of the page is missing. */
  truncated: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** Reads the text printed on a scanned page (OCR through a vision model). */
export interface PageTextReader {
  readonly descriptor: ProviderDescriptor;
  /** Upper bound of output tokens for one page; used to reserve budget before the call. */
  readonly maxOutputTokensPerPage: number;
  /** Rough input tokens for one page image plus instructions; used to reserve budget. */
  readonly estimatedInputTokensPerPage: number;
  /** Scale to render a PDF page at before reading it (1 = 72 dpi). Default: the extractor's own. */
  readonly renderScale?: number;
  readPage(png: Uint8Array, signal?: AbortSignal): Promise<PageReading>;
}

/**
 * The provider refused one or more texts as too long. Nothing was truncated and
 * nothing was embedded for this call; the caller may split the text and retry.
 */
export class EmbeddingInputTooLongError extends Error {
  readonly code = "embedding_failed" as const;
  constructor(message: string, readonly source: "local_guard" | "provider", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmbeddingInputTooLongError";
  }
}
