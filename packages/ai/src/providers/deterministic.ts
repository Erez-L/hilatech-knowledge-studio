/**
 * DETERMINISTIC TEST DOUBLES — not AI.
 *
 * These exist so the pipeline (ingestion, vector storage, retrieval, citation
 * validation, streaming, persistence) can be exercised without a model
 * endpoint. They are selectable only in tests, or outside production when
 * SAMPLE_MODE=true. Everything they produce is tagged `test_double`, stored
 * in its own embedding index, saved with pipeline_mode = 'sample', and
 * labelled as sample output in the interface.
 */
import { createHash } from "node:crypto";
import { normalizeForSearch } from "../text/normalize.ts";
import type { ChatEvent, ChatModelProvider, ChatRequest, EmbeddingsDescriptor, EmbeddingsProvider, PageReading, PageTextReader, ProviderDescriptor } from "./types.ts";

export const DETERMINISTIC_MODEL_ID = "deterministic-test-double-v1";

/**
 * Lexical hashing embedder: each word (and adjacent word pair) is hashed into
 * a signed bucket, then the vector is L2-normalized. Texts that share words
 * get similar vectors. It has NO semantic understanding and no cross-language
 * ability; it only makes retrieval behave plausibly in tests.
 */
export class DeterministicEmbeddings implements EmbeddingsProvider {
  readonly descriptor: EmbeddingsDescriptor;
  readonly maxCharsPerText = 2048;

  constructor(dimensions = 1024) {
    this.descriptor = { provider: "deterministic", modelId: DETERMINISTIC_MODEL_ID, kind: "test_double", dimensions };
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embed(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }

  private embed(text: string): number[] {
    const { dimensions } = this.descriptor;
    const vector = new Array<number>(dimensions).fill(0);
    const words = normalizeForSearch(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
    const add = (token: string, weight: number) => {
      const digest = createHash("sha256").update(token).digest();
      const bucket = digest.readUInt32BE(0) % dimensions;
      vector[bucket]! += (digest[4]! & 1 ? 1 : -1) * weight;
    };
    words.forEach((word, i) => {
      add(word, 1);
      const next = words[i + 1];
      if (next) add(`${word} ${next}`, 0.5);
    });
    const norm = Math.hypot(...vector);
    if (norm === 0) {
      vector[0] = 1; // empty text still yields a valid unit vector
      return vector;
    }
    return vector.map((value) => value / norm);
  }
}

const STOP_WORDS = new Set(
  "the a an and or of to in on for is are was were be been it this that with as at by from do does did what which who how when where why can we you our your".split(" "),
);

/**
 * Extractive stand-in for a chat model: it does not reason. It reads the
 * `<source id="S1">…</source>` blocks from the request and replies with the
 * first sentences of the highest-ranked sources, each followed by its label.
 * With no sources it emits the insufficient-evidence marker.
 */
export class DeterministicChatModel implements ChatModelProvider {
  readonly descriptor: ProviderDescriptor = { provider: "deterministic", modelId: DETERMINISTIC_MODEL_ID, kind: "test_double" };

  async *streamAnswer(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent> {
    const sources = [...request.user.matchAll(/<source id="(S\d+)"[^>]*>\n?([\s\S]*?)\n?<\/source>/g)].map((m) => ({
      label: m[1]!,
      text: m[2]!.trim(),
    }));
    const answer =
      sources.length === 0
        ? "INSUFFICIENT_EVIDENCE"
        : sources
            .slice(0, 2)
            .map((source) => `${firstSentences(source.text, 2)} [${source.label}]`)
            .join("\n\n");

    // Emit in small pieces so streaming, cancellation and the citation filter are exercised.
    for (const piece of answer.match(/[\s\S]{1,17}/g) ?? []) {
      if (signal?.aborted) return;
      yield { type: "text", text: piece };
    }
    yield {
      type: "done",
      inputTokens: Math.ceil((request.system.length + request.user.length) / 4),
      outputTokens: Math.ceil(answer.length / 4),
      stopReason: "end_turn",
    };
  }
}

function firstSentences(text: string, count: number): string {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g);
  return (sentences ? sentences.slice(0, count).join("") : text).trim();
}

/**
 * Stand-in for the page reader. It does NOT read the image: it returns a fixed sentence with a
 * fingerprint of the image bytes, so tests can tell pages apart and prove the plumbing.
 */
export class DeterministicPageReader implements PageTextReader {
  readonly descriptor: ProviderDescriptor = { provider: "deterministic", modelId: DETERMINISTIC_MODEL_ID, kind: "test_double" };
  readonly maxOutputTokensPerPage = 200;
  readonly estimatedInputTokensPerPage = 100;
  async readPage(png: Uint8Array): Promise<PageReading> {
    const fingerprint = createHash("sha256").update(png).digest("hex").slice(0, 12);
    const text = `Sample transcription of a scanned page, produced by a test double and not read from the image. Page image ${fingerprint}.`;
    return { text, truncated: false, inputTokens: 100, outputTokens: 40 };
  }
}
