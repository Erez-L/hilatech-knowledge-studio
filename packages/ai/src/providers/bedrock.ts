import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { AppError } from "@hks/shared";
import { EmbeddingInputTooLongError } from "./types.ts";
import type {
  ChatEvent,
  ChatModelProvider,
  ChatRequest,
  EmbeddingsDescriptor,
  EmbeddingsProvider,
  PageReading,
  PageTextReader,
  ProviderDescriptor,
} from "./types.ts";

/**
 * Amazon Bedrock adapters (production).
 *
 * NOT YET VERIFIED AGAINST BEDROCK: the build environment cannot reach AWS
 * and has no credentials. Request and response shapes follow the AWS SDK
 * types and the Cohere Embed v3 model documentation; unit tests cover them
 * with a stubbed client only. Credentials come from the AWS default provider
 * chain (task role in production) and are never read from application config.
 */

type Sender = Pick<BedrockRuntimeClient, "send">;

export class BedrockChatModel implements ChatModelProvider {
  readonly descriptor: ProviderDescriptor;
  private readonly client: Sender;

  constructor(options: { region: string; modelId: string; client?: Sender }) {
    this.descriptor = { provider: "bedrock", modelId: options.modelId, kind: "live" };
    this.client = options.client ?? new BedrockRuntimeClient({ region: options.region, maxAttempts: 2 });
  }

  async *streamAnswer(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    try {
      const response = await this.client.send(
        new ConverseStreamCommand({
          modelId: this.descriptor.modelId,
          system: [{ text: request.system }],
          messages: [{ role: "user", content: [{ text: request.user }] }],
          inferenceConfig: { maxTokens: request.maxOutputTokens, ...(request.temperature === undefined ? {} : { temperature: request.temperature }) },
        }),
        { abortSignal: signal },
      );
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let stopReason: string | null = null;
      for await (const event of response.stream ?? []) {
        const text = event.contentBlockDelta?.delta?.text;
        if (text) yield { type: "text", text };
        if (event.messageStop) stopReason = event.messageStop.stopReason ?? null;
        if (event.metadata?.usage) {
          inputTokens = event.metadata.usage.inputTokens ?? null;
          outputTokens = event.metadata.usage.outputTokens ?? null;
        }
        const failure =
          event.internalServerException ??
          event.modelStreamErrorException ??
          event.throttlingException ??
          event.validationException ??
          event.serviceUnavailableException;
        if (failure) throw failure;
      }
      yield { type: "done", inputTokens, outputTokens, stopReason };
    } catch (error) {
      if (signal?.aborted) return;
      throw new AppError("provider_error", `Bedrock chat request failed (${errorName(error)})`, { cause: error });
    }
  }
}

/**
 * Instructions for reading a scanned page. The model is asked for a transcription and nothing
 * else: text it "remembers" from a well-known book would be indexed and cited as if it were
 * printed on the page, so completing from memory is ruled out explicitly.
 */
export const PAGE_READING_INSTRUCTIONS = [
  "You transcribe scanned document pages.",
  "Output only the text that is printed on the page image, in its original language and script, in reading order. Hebrew and Aramaic stay in Hebrew letters, including text printed in Rashi script.",
  "Do not translate, summarize, explain, correct, or complete anything from memory. Transcribe only what is visible.",
  "Where a word cannot be read, write [?] in its place.",
  "When the page has several separate text areas, such as a main text with commentaries printed around it, transcribe each area on its own, one after another, and start each with a heading line: the title printed for that area if there is one, otherwise a short name for its position (for example: main text, inner column, outer column, margin notes).",
  "Skip decorations and page ornaments. Keep page headers such as the tractate name and page number as the first line.",
  "If the page contains no text, output nothing.",
].join("\n");

/**
 * Reads scanned pages with a vision-capable chat model on Bedrock (Converse API, image input).
 * NOT YET VERIFIED AGAINST BEDROCK at the time of writing: unit tests use a stubbed client.
 * Accuracy on dense or unusual typography (Rashi script, multi-column pages) is not measured.
 */
export class BedrockPageReader implements PageTextReader {
  readonly descriptor: ProviderDescriptor;
  readonly maxOutputTokensPerPage: number;
  readonly estimatedInputTokensPerPage = 2500;
  private readonly client: Sender;

  constructor(options: { region: string; modelId: string; maxOutputTokens: number; client?: Sender }) {
    this.descriptor = { provider: "bedrock", modelId: options.modelId, kind: "live" };
    this.maxOutputTokensPerPage = options.maxOutputTokens;
    this.client = options.client ?? new BedrockRuntimeClient({ region: options.region, maxAttempts: 2 });
  }

  async readPage(png: Uint8Array, signal?: AbortSignal): Promise<PageReading> {
    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.descriptor.modelId,
          system: [{ text: PAGE_READING_INSTRUCTIONS }],
          messages: [
            {
              role: "user",
              content: [{ image: { format: "png", source: { bytes: png } } }, { text: "Transcribe this page." }],
            },
          ],
          inferenceConfig: { maxTokens: this.maxOutputTokensPerPage, temperature: 0 },
        }),
        { abortSignal: signal },
      );
      const text = (response.output?.message?.content ?? []).map((part) => part.text ?? "").join("");
      return {
        text: text.trim(),
        truncated: response.stopReason === "max_tokens",
        inputTokens: response.usage?.inputTokens ?? null,
        outputTokens: response.usage?.outputTokens ?? null,
      };
    } catch (error) {
      throw new AppError("provider_error", `Bedrock page reading failed (${errorName(error)})`, { cause: error });
    }
  }
}

/**
 * Cohere Embed v3 limits, per the model documentation: 96 texts per call and 512 tokens per text
 * (described there as roughly 2,048 characters of English). The request uses truncate "NONE", so
 * a longer text is rejected by the service, never shortened.
 */
const COHERE_MAX_TEXTS = 96;
const COHERE_MAX_CHARS = 2048;
const COHERE_MAX_TOKENS = 512;
/** Texts are sized to this, leaving headroom because the estimate below is not Cohere's tokenizer. */
const COHERE_TARGET_TOKENS = 400;

/**
 * A deliberately high estimate of Cohere's token count. The real tokenizer is not available
 * locally, so this is NOT a validation. It assumes:
 * - a Latin-script word or number: one token per 3 characters (English averages about 4);
 * - a Hebrew word: one token, plus one per 3 letters. Calibrated on the live
 *   measurement in docs/VERIFICATION_RUN_2026-11-17.md: a Hebrew prose sentence repeated to
 *   1,500 characters was accepted under the 512-token limit and to 1,800 characters rejected,
 *   so that prose needs at most 512 / 1,500 = 0.34 tokens per character; this estimate gives
 *   0.38 for it, and the 400-token target leaves another 28% of headroom on top;
 * - a Hebrew vowel or cantillation mark: one token each (pointed text splits into many pieces);
 * - any other script: one token per 1.5 characters; a punctuation mark or symbol: one token.
 * Whether the headroom holds is measured by the live embeddings test, and a passage the service
 * still rejects is split and retried (see the ingestion code), never truncated.
 */
export function estimateCohereTokens(text: string): number {
  let tokens = 0;
  for (const run of text.match(/[A-Za-z0-9]+|[\u05D0-\u05EA\u05EF-\u05F4]+|[^\sA-Za-z0-9]/gu) ?? []) {
    const first = run.charCodeAt(0);
    if (/^[A-Za-z0-9]/.test(run)) tokens += Math.ceil(run.length / 3);
    else if (first >= 0x05d0 && first <= 0x05f4) tokens += Math.floor(run.length / 3) + 1;
    else if (first >= 0x0591 && first <= 0x05c7) tokens += 1;
    else tokens += first < 128 ? 1 : 1 / 1.5;
  }
  return Math.ceil(tokens) + 2; // start and end markers
}

export class BedrockCohereEmbeddings implements EmbeddingsProvider {
  readonly descriptor: EmbeddingsDescriptor;
  readonly maxCharsPerText = COHERE_MAX_CHARS;
  readonly maxTokensPerText = COHERE_TARGET_TOKENS;
  readonly estimateTokens = estimateCohereTokens;
  private readonly client: Sender;
  private readonly batchSize: number;

  constructor(options: { region: string; modelId: string; dimensions: number; batchSize: number; client?: Sender }) {
    this.descriptor = { provider: "bedrock-cohere", modelId: options.modelId, kind: "live", dimensions: options.dimensions };
    this.client = options.client ?? new BedrockRuntimeClient({ region: options.region, maxAttempts: 3 });
    this.batchSize = Math.min(options.batchSize, COHERE_MAX_TEXTS);
  }

  async embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += this.batchSize) {
      vectors.push(...(await this.invoke(texts.slice(start, start + this.batchSize), "search_document", signal)));
    }
    return vectors;
  }

  async embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
    const [vector] = await this.invoke([text], "search_query", signal);
    if (!vector) throw new AppError("embedding_failed", "No embedding returned for the query");
    return vector;
  }

  private async invoke(texts: string[], inputType: "search_document" | "search_query", signal?: AbortSignal) {
    const tooLong = texts.findIndex((text) => text.length > COHERE_MAX_CHARS);
    if (tooLong !== -1) {
      // Never let the provider truncate silently: a truncated passage would be cited as if whole.
      throw new EmbeddingInputTooLongError(`Text ${tooLong} exceeds ${COHERE_MAX_CHARS} characters`, "local_guard");
    }
    let payload: unknown;
    try {
      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.descriptor.modelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({ texts, input_type: inputType, truncate: "NONE", embedding_types: ["float"] }),
        }),
        { abortSignal: signal },
      );
      payload = JSON.parse(new TextDecoder().decode(response.body));
    } catch (error) {
      // With truncate "NONE" an over-long text comes back as a ValidationException. Other validation
      // problems look the same, so the caller's split-and-retry is bounded.
      if (errorName(error) === "ValidationException") {
        throw new EmbeddingInputTooLongError(`Bedrock rejected the request as invalid, possibly a text over ${COHERE_MAX_TOKENS} tokens`, "provider", { cause: error });
      }
      throw new AppError("embedding_failed", `Bedrock embeddings request failed (${errorName(error)})`, { cause: error });
    }
    const raw = (payload as { embeddings?: unknown }).embeddings;
    const vectors = Array.isArray(raw) ? raw : (raw as { float?: unknown } | undefined)?.float;
    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new AppError("embedding_failed", "Unexpected embeddings response shape");
    }
    for (const vector of vectors as unknown[]) {
      if (!Array.isArray(vector) || vector.length !== this.descriptor.dimensions) {
        throw new AppError("embedding_failed", `Embedding does not have ${this.descriptor.dimensions} dimensions`);
      }
    }
    return vectors as number[][];
  }
}

const errorName = (error: unknown) => (error as { name?: string })?.name ?? "error";
