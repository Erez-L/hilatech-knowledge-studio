import type { ExtractedBlock } from "../extraction/types.ts";
import { estimateTokens, normalizeForSearch } from "./normalize.ts";

export type ChunkOptions = { targetChars: number; maxChars: number; overlapChars: number };

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

export const chunkingVersion = (o: ChunkOptions) => `v2:${o.targetChars}/${o.maxChars}/${o.overlapChars}`;

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
 */
export function chunkBlocks(blocks: ExtractedBlock[], options: ChunkOptions): Chunk[] {
  if (options.overlapChars > options.maxChars - options.targetChars) {
    throw new Error("overlapChars must not exceed maxChars - targetChars");
  }
  // Units are at most targetChars long, so a unit plus the carried overlap always fits in maxChars.
  const units = blocks.flatMap((block) => toUnits(block, options.targetChars));
  const version = chunkingVersion(options);
  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let carried = null as Unit | null; // overlap text from the previous chunk

  const length = () => current.reduce((sum, unit) => sum + unit.text.length + 2, carried ? carried.text.length + 2 : 0);

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
    // The carried overlap must never push a chunk past the hard limit.
    if (carried && carried.text.length + 2 + unit.text.length > options.maxChars) carried = null;
    if (carried && !sameSection(carried.section, unit.section)) carried = null;
    // Overlap never crosses a page: a chunk's page number must describe all of its text start.
    if (carried && carried.page !== unit.page) carried = null;
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
  const half = Math.ceil(chunk.text.length / 2);
  const pieces = splitLong(chunk.text, Math.max(minChars, half));
  // A text with no usable break (returned whole) is cut in the middle.
  const parts = pieces.length > 1 ? pieces : [chunk.text.slice(0, half), chunk.text.slice(half)];
  return parts
    .map((text) => text.trim())
    .filter(Boolean)
    .flatMap((text) => splitChunkToFit({ ...chunk, text, searchText: normalizeForSearch(text), tokenEstimate: estimateTokens(text) }, fits, minChars));
}
