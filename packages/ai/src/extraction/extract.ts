import { AppError, isAppError } from "@hks/shared";
import { normalizeForDisplay } from "../text/normalize.ts";
import { inspectZip, measureZipExpansion } from "./detect.ts";
import { loadPdfLibrary } from "./pdf-library.ts";
import { openPdfRenderer } from "./render.ts";
import { DEFAULT_EXTRACTION_LIMITS, type ExtractedBlock, type ExtractedDocument, type ExtractionLimits, type FileType, type ScannedPageReading } from "./types.ts";

/** Extracts text with page or section locations. Throws AppError with a stable code on failure. */
export async function extractDocument(
  bytes: Uint8Array,
  fileType: FileType,
  limits: ExtractionLimits = DEFAULT_EXTRACTION_LIMITS,
  scanned?: ScannedPageReading,
): Promise<ExtractedDocument> {
  let result: ExtractedDocument;
  try {
    if (fileType === "pdf") result = await extractPdf(bytes, limits, scanned);
    else if (fileType === "docx") result = await extractDocx(bytes);
    else result = extractText(bytes, fileType === "md");
  } catch (error) {
    if (isAppError(error)) throw error;
    throw new AppError("extraction_failed", "The file could not be read", { cause: error });
  }
  const blocks = result.blocks
    .map((block) => ({ ...block, text: normalizeForDisplay(block.text) }))
    .filter((block) => block.text.length > 0);
  const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (total === 0) throw new AppError("extraction_failed", "No text was found in the file");
  if (total > limits.maxChars) throw new AppError("payload_too_large", "The document contains too much text");
  return { blocks, pageCount: result.pageCount, ocrPages: result.ocrPages };
}

/**
 * PDF: one block per page, so page numbers are exact.
 * A page with (almost) no text layer is a scan. With a page reader (`scanned`), such pages are
 * rendered to an image and read by it, up to `scanned.maxPages`; the page number stays exact.
 * Without one, a PDF that is all scans is reported as unsupported instead of indexed as empty.
 * Right-to-left reading order: verified for the Hebrew sample PDFs in this repository
 * (scripts/check-samples.ts). Hebrew PDFs from other producers are not verified.
 */
async function extractPdf(bytes: Uint8Array, limits: ExtractionLimits, scanned?: ScannedPageReading): Promise<ExtractedDocument> {
  const { getDocumentProxy } = await loadPdfLibrary();
  let pages: string[];
  let totalPages: number;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    totalPages = pdf.numPages;
    if (totalPages > limits.maxPages) throw new AppError("too_many_pages", `The PDF has more than ${limits.maxPages} pages`);
    pages = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pages.push(joinTextItems(content.items.flatMap((item) => ("str" in item ? [item] : []))));
    }
  } catch (error) {
    if (isAppError(error)) throw error;
    const name = (error as { name?: string }).name ?? "";
    if (name === "PasswordException") throw new AppError("malformed_file", "The PDF is password-protected");
    throw new AppError("malformed_file", "The PDF could not be opened", { cause: error });
  }
  pages = stripRunningLines(pages);
  const inkOf = (page: string) => page.replace(/\s/g, "").length;
  const textChars = pages.reduce((sum, page) => sum + inkOf(page), 0);
  const mostlyScanned = textChars < Math.max(40, totalPages * 15);
  const ocrPages: number[] = [];
  if (!scanned) {
    if (mostlyScanned) throw new AppError("unsupported_scanned_pdf", "The PDF has no text layer. Scanned documents are not supported");
  } else {
    // Pages without a text layer. In a PDF that otherwise has text, an empty page is usually a
    // full-page figure or scan; in a scanned PDF it is every page.
    // A page whose text layer is unreadable (see looksLikeBrokenFontText) is read the same way.
    const empty = pages.flatMap((page, index) => (inkOf(page) < SCANNED_PAGE_MAX_CHARS || looksLikeBrokenFontText(page) ? [index + 1] : []));
    if (empty.length > scanned.maxPages) {
      throw new AppError("too_many_pages", `The PDF has ${empty.length} scanned pages; up to ${scanned.maxPages} can be read`);
    }
    // One parse of the file for all of its scanned pages, not one per page.
    const renderer = empty.length ? await openPdfRenderer(bytes) : null;
    try {
      for (const pageNumber of empty) {
        const png = await renderer!.render(pageNumber, scanned.renderScale ?? SCANNED_PAGE_RENDER_SCALE);
        const text = (await scanned.readPage(png, pageNumber)).trim();
        // Whatever the text layer held is dropped either way: it was empty or unreadable.
        pages[pageNumber - 1] = text;
        if (text) ocrPages.push(pageNumber);
      }
    } finally {
      await renderer?.close();
    }
    if (pages.reduce((sum, page) => sum + inkOf(page), 0) === 0) {
      throw new AppError("extraction_failed", "No text was found in the file");
    }
  }
  const read = new Set(ocrPages);
  return {
    pageCount: totalPages,
    ocrPages,
    // PDF text arrives with a line break at the end of every printed line. Those are
    // layout, not structure: join them so sentences are whole. Blank lines are kept.
    // A hyphen at a line end is kept: it may belong to a compound word.
    // Text read from a page image keeps its own line breaks: there they separate areas and headings.
    blocks: pages.map((text, index) => ({
      text: read.has(index + 1) ? text : text.replace(/-\n(?=\p{Ll})/gu, "-").replace(/(?<!\n)\n(?!\n)/g, " "),
      pageNumber: index + 1,
      sectionPath: null,
    })),
  };
}

/** The parts of a pdf.js text item that joining needs. `transform` is [a, b, c, d, x, y]. */
export type PdfTextItem = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean };

/**
 * A word gap wider than this share of the font size is a space. Gaps between the letters of one
 * word (kerning, a font change mid-word) are far smaller; a normal word space is about a quarter.
 */
const SPACE_GAP_RATIO = 0.15;

/**
 * Joins the text items of one PDF page into text, using where each item sits on the page.
 *
 * Many PDF producers, Hebrew ones especially, draw every word (or every few letters) as its own
 * item and leave the space out: the gap is just empty page. Joining the strings as they come
 * ("".join) then glues the words together. Here a space is added between two items on the same
 * line when the horizontal gap between them is wider than a fraction of the font size, whichever
 * side of the earlier item the later one is on (so right-to-left lines work the same), and a line
 * break is added at each end of line. Text the producer already spaced is left as it is.
 */
export function joinTextItems(items: PdfTextItem[]): string {
  let out = "";
  let previous: { left: number; right: number; y: number; size: number } | null = null;
  for (const item of items) {
    const [, , c = 0, d = 0, x = 0, y = 0] = item.transform;
    const size = Math.hypot(c, d) || item.height || 1;
    if (item.str.length > 0 && previous && !out.endsWith("\n")) {
      const sameLine = Math.abs(y - previous.y) <= Math.max(size, previous.size) * 0.5;
      if (!sameLine) out += "\n";
      else {
        // Distance between the two items' horizontal extents; zero or less when they touch or overlap.
        const gap = Math.max(x, previous.left) - Math.min(x + item.width, previous.right);
        if (gap > Math.min(size, previous.size) * SPACE_GAP_RATIO && !/\s$/.test(out) && !/^\s/.test(item.str)) out += " ";
      }
    }
    out += item.str;
    if (item.hasEOL) {
      out += "\n";
      previous = null;
    } else if (item.str.length > 0) {
      previous = { left: x, right: x + item.width, y, size };
    }
  }
  return out;
}

/** A page with fewer printed characters than this in its text layer is treated as a scan. */
const SCANNED_PAGE_MAX_CHARS = 15;
/** 72 dpi × 2.5 = 180 dpi: enough for small print without making the image needlessly large. */
const SCANNED_PAGE_RENDER_SCALE = 2.5;

/**
 * True when a page's text layer is not real text: the PDF's font maps its glyphs to the wrong
 * characters, so Hebrew comes out as runs like "]UF VTHL [FU G[HQ]H". The page looks fine on
 * screen and prints fine, but the extracted text is useless for search and must not be indexed.
 *
 * The test is deliberately narrow, to avoid sending good pages to a paid model call: the page
 * must have a fair amount of text, almost none of it lowercase Latin or any non-Latin script
 * (real prose in any language has plenty of one or the other), mostly upper-case letters, and a noticeable share of
 * bracket-and-backslash symbols, which such font tables use as letters and prose hardly uses.
 * Upper-case headings, tables of numbers and source code do not match.
 */
export function looksLikeBrokenFontText(page: string): boolean {
  const ink = page.replace(/\s/g, "");
  if (ink.length < 80) return false;
  const count = (pattern: RegExp) => ink.match(pattern)?.length ?? 0;
  const natural = count(/[a-z]|[^\u0000-\u007F]/g);
  const upper = count(/[A-Z]/g);
  const mappingSymbols = count(/[[\]\\@<>^_`{}~]/g);
  return natural / ink.length < 0.1 && upper / ink.length >= 0.4 && mappingSymbols / ink.length >= 0.06;
}

/**
 * Removes running headers and footers: short lines that repeat on most pages
 * once digits are ignored ("Handbook | Page 7"). Left in, they would be
 * indexed dozens of times and quoted as if they were content.
 */
function stripRunningLines(pages: string[]): string[] {
  if (pages.length < 3) return pages;
  const key = (line: string) => line.trim().replace(/\d+/g, "#");
  const seenOn = new Map<string, number>();
  for (const page of pages) {
    for (const k of new Set(page.split("\n").map(key))) {
      if (k && k.length <= 120) seenOn.set(k, (seenOn.get(k) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  const running = new Set([...seenOn].filter(([, count]) => count >= threshold).map(([k]) => k));
  if (running.size === 0) return pages;
  return pages.map((page) => page.split("\n").filter((line) => !running.has(key(line))).join("\n"));
}

/** DOCX: converted to simple HTML by mammoth, then walked block by block, tracking the heading trail. */
/** What a Word document may expand to, all parts together, actually inflated. */
export const DOCX_MAX_EXPANDED_BYTES = 64 * 1024 * 1024;

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDocument> {
  inspectZip(bytes); // zip-bomb and structure check before the parser touches it
  // The sizes above are what the file declares. Inflate every part once, with a hard cap, so a
  // file that lies about them is refused before the parser expands it in memory.
  measureZipExpansion(bytes, DOCX_MAX_EXPANDED_BYTES);
  const mammoth = (await import("mammoth")).default;
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
  } catch (error) {
    throw new AppError("malformed_file", "The Word document could not be opened", { cause: error });
  }
  const blocks: ExtractedBlock[] = [];
  const trail: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length) blocks.push({ text: buffer.join("\n\n"), pageNumber: null, sectionPath: trail.length ? [...trail] : null });
    buffer = [];
  };
  for (const match of html.matchAll(/<(h[1-6]|p|li|tr)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const tag = match[1]!;
    const inner = match[2]!;
    const text =
      tag === "tr"
        ? [...inner.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => htmlToText(cell[1]!)).join(" | ")
        : htmlToText(inner);
    if (!text) continue;
    if (tag.startsWith("h")) {
      flush();
      const level = Number(tag[1]);
      trail.length = Math.min(trail.length, level - 1);
      trail.push(text.slice(0, 200));
      buffer.push(text);
    } else buffer.push(tag === "li" ? `- ${text}` : text);
  }
  flush();
  return { blocks, pageCount: null, ocrPages: [] };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[entity.toLowerCase()] ?? whole;
    })
    .trim();
}

/** TXT and Markdown. Markdown headings become the section trail. */
function extractText(bytes: Uint8Array, markdown: boolean): ExtractedDocument {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("malformed_file", "The text file is not valid UTF-8");
  }
  if (!markdown) return { pageCount: null, ocrPages: [], blocks: [{ text, pageNumber: null, sectionPath: null }] };

  const blocks: ExtractedBlock[] = [];
  const trail: string[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (lines.join("").trim()) blocks.push({ text: lines.join("\n"), pageNumber: null, sectionPath: trail.length ? [...trail] : null });
    lines = [];
  };
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flush();
      const level = heading[1]!.length;
      trail.length = Math.min(trail.length, level - 1);
      trail.push(heading[2]!.slice(0, 200));
      lines.push(heading[2]!);
    } else lines.push(line);
  }
  flush();
  return { pageCount: null, ocrPages: [], blocks };
}
