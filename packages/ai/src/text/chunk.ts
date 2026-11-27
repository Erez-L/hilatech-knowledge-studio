import type { ExtractedBlock } from "../extraction/types.ts";
import { estimateTokens, normalizeForSearch } from "./normalize.ts";

export type ChunkOptions = {
  targetChars: number;
  maxChars: number;
  overlapChars: number;
  /**
   * The embedding model's token limit per text, with its estimate. When given, chunks are packed
   * so that each one fits, instead of being cut afterwards: a chunk of Hebrew (more tokens per
   * character than English) then ends at a paragraph or sentence and still shares its overlap with
   * the next one.
   */
  tokens?: { max: number; estimate: (text: string) => number };
};

export type Chunk = {
  chunkIndex: number;
  text: string;
  searchText: string;
  pageNumber: number | null;
  pageEnd: number | null;
  sectionPath: string[] | null;
  tokenEstimate: number;
  chunkingVersion: string;
};

type Unit = { text: string; page: number | null; section: string[] | null };

/** v3: PDF words are spaced by position, and chunks are packed to the token limit when one is given. */
export const chunkingVersion = (o: ChunkOptions) =>
  `v3:${o.targetChars}/${o.maxChars}/${o.overlapChars}${o.tokens ? `/t${o.tokens.max}` : ""}`;

/**
 * Structure-aware chunking.
 *
 * - Text is packed paragraph by paragraph up to `targetChars`.
 * - A paragraph longer than `targetChars` is split at sentence ends, and a
 *   sentence longer than that at whitespace. No chunk exceeds `maxChars`.
 * - A new section (heading trail) starts a new chunk, and so does a new page:
 *   a chunk never spans two pages, so the page a citation shows is the page
 *   that holds the cited text.
 * - Consecutive chunks in the same section and on the same page share up to
 *   `overlapChars` of trailing sentences, so a fact split across a boundary is
 *   still retrievable. Overlap never crosses a page, which keeps citations exact.
 * - Page numbers are carried from extraction. `pageEnd` is kept for stored
 *   chunks of earlier versions and is always null here.
 * - With `tokens`, the same rules hold in tokens as well: a unit is at most the same share of
 *   the token limit that `targetChars` is of `maxChars`, a chunk closes before it would pass the
 *   limit, and the overlap is carried only when it still fits.
 */
export function chunkBlocks(blocks: ExtractedBlock[], options: ChunkOptions): Chunk[] {
  if (options.overlapChars > options.maxChars - options.targetChars) {
    throw new Error("overlapChars must not exceed maxChars - targetChars");
  }
  // Units are at most targetChars long, so a unit plus the carried overlap always fits in maxChars.
  // With a token limit, a unit is also at most the same share of it, leaving room for the overlap.
  const tokens = options.tokens;
  const unitTokens = tokens ? Math.max(1, Math.floor((tokens.max * options.targetChars) / options.maxChars)) : Infinity;
  const units = blocks
    .flatMap((block) => toUnits(block, options.targetChars))
    .flatMap((unit) =>
      tokens && tokens.estimate(unit.text) > unitTokens
        ? splitTextToFit(unit.text, (text) => tokens.estimate(text) <= unitTokens).map((text) => ({ ...unit, text }))
        : [unit],
    );
  const version = chunkingVersion(options);
  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let carried = null as Unit | null; // overlap text from the previous chunk

  const length = () => current.reduce((sum, unit) => sum + unit.text.length + 2, carried ? carried.text.length + 2 : 0);
  const joined = (parts: Unit[]) => parts.map((unit) => unit.text).join("\n\n");
  /** True when these units, joined as a chunk, would pass the token limit. */
  const overTokens = (parts: Unit[]) => Boolean(tokens && tokens.estimate(joined(parts)) > tokens.max);

  const flush = (allowOverlap: boolean) => {
    if (current.length === 0) return;
    const parts = carried ? [carried, ...current] : current;
    const text = parts.map((unit) => unit.text).join("\n\n");
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    chunks.push({
      chunkIndex: chunks.length,
      text,
      searchText: normalizeForSearch(text),
      pageNumber: first.page,
      pageEnd: last.page !== null && last.page !== first.page ? last.page : null,
      sectionPath: current[0]!.section,
      tokenEstimate: estimateTokens(text),
      chunkingVersion: version,
    });
    const tail = allowOverlap && options.overlapChars > 0 ? trailingSentences(last.text, options.overlapChars) : "";
    carried = tail ? { text: tail, page: last.page, section: last.section } : null;
    current = [];
  };

  for (const unit of units) {
    const sectionChanged = current.length > 0 && !sameSection(current[0]!.section, unit.section);
    const pageChanged = current.length > 0 && current[0]!.page !== unit.page;
    if (sectionChanged || pageChanged) flush(false);
    else if (current.length > 0 && length() + unit.text.length > options.targetChars) flush(true);
    else if (current.length > 0 && overTokens([...(carried ? [carried] : []), ...current, unit])) flush(true);
    // The carried overlap must never push a chunk past the hard limit.
    if (carried && carried.text.length + 2 + unit.text.length > options.maxChars) carried = null;
    if (carried && !sameSection(carried.section, unit.section)) carried = null;
    // Overlap never crosses a page: a chunk's page number must describe all of its text start.
    if (carried && carried.page !== unit.page) carried = null;
    if (carried && current.length === 0 && overTokens([carried, unit])) carried = null;
    current.push(unit);
  }
  flush(false);
  return chunks;
}

const sameSection = (a: string[] | null, b: string[] | null) => (a ?? []).join("\u0000") === (b ?? []).join("\u0000");

function toUnits(block: ExtractedBlock, maxChars: number): Unit[] {
  const units: Unit[] = [];
  for (const paragraph of block.text.split(/\n{2,}/)) {
    const text = paragraph.trim();
    if (!text) continue;
    for (const piece of text.length <= maxChars ? [text] : splitLong(text, maxChars)) {
      units.push({ text: piece, page: block.pageNumber, section: block.sectionPath });
    }
  }
  return units;
}

/** Sentence boundaries for Latin and Hebrew text (both use . ! ?), plus line breaks. */
const SENTENCE = /[^.!?\n]+(?:[.!?]+["'”’)\]]*|\n|$)\s*/g;

function splitLong(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let buffer = "";
  const push = () => {
    if (buffer.trim()) pieces.push(buffer.trim());
    buffer = "";
  };
  for (const sentence of text.match(SENTENCE) ?? [text]) {
    if (sentence.length > maxChars) {
      push();
      // A single sentence longer than the limit: split at whitespace.
      let rest = sentence;
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf(" ", maxChars);
        const at = cut > maxChars * 0.5 ? cut : maxChars;
        pieces.push(rest.slice(0, at).trim());
        rest = rest.slice(at);
      }
      buffer = rest;
      continue;
    }
    if (buffer.length + sentence.length > maxChars) push();
    buffer += sentence;
  }
  push();
  return pieces;
}

function trailingSentences(text: string, maxChars: number): string {
  const sentences = text.match(SENTENCE) ?? [];
  let tail = "";
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = sentences[i]! + tail;
    if (next.trim().length > maxChars) break;
    tail = next;
  }
  // Do not duplicate the whole previous unit: overlap is only useful as a partial tail.
  return tail.trim().length < text.trim().length ? tail.trim() : "";
}

/**
 * Splits one chunk into smaller chunks that each satisfy `fits`, at sentence ends where possible
 * and at whitespace otherwise. Page number and section are inherited, so a citation of any piece
 * still points at the right place. Pieces do not overlap and together contain all of the text.
 * `chunkIndex` is left for the caller to renumber. Returns the chunk itself when it already fits.
 */
export function splitChunkToFit(chunk: Chunk, fits: (text: string) => boolean, minChars = 40): Chunk[] {
  if (fits(chunk.text) || chunk.text.length <= minChars) return [chunk];
  return splitTextToFit(chunk.text, fits, minChars).map((text) => ({
    ...chunk, text, searchText: normalizeForSearch(text), tokenEstimate: estimateTokens(text),
  }));
}

/**
 * Splits a text into pieces that each satisfy `fits`, halving at sentence ends where possible and
 * at whitespace otherwise. Pieces are trimmed and together contain all of the text.
 */
export function splitTextToFit(text: string, fits: (text: string) => boolean, minChars = 40): string[] {
  if (fits(text) || text.length <= minChars) return [text];
  const half = Math.ceil(text.length / 2);
  const pieces = splitLong(text, Math.max(minChars, half));
  // A text with no usable break (returned whole) is cut in the middle.
  const parts = pieces.length > 1 ? pieces : [text.slice(0, half), text.slice(half)];
  return parts
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => splitTextToFit(piece, fits, minChars));
}
