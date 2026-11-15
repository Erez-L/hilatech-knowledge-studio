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
