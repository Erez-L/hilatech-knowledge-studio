export type FileType = "pdf" | "docx" | "txt" | "md";

/** A run of extracted text with where it came from. Page numbers are 1-based and only ever come from the file. */
export type ExtractedBlock = {
  text: string;
  pageNumber: number | null;
  sectionPath: string[] | null;
};

export type ExtractedDocument = {
  blocks: ExtractedBlock[];
  /** PDF only. */
  pageCount: number | null;
  /** PDF only: 1-based numbers of the pages whose text was read from the page image (OCR). */
  ocrPages: number[];
};

/**
 * How scanned pages get read. `readPage` receives the page rendered as a PNG and returns its
 * text; the caller owns the model, the budget and the accounting.
 */
export type ScannedPageReading = {
  maxPages: number;
  readPage(png: Uint8Array, pageNumber: number): Promise<string>;
};

export type ExtractionLimits = { maxPages: number; maxChars: number };
export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = { maxPages: 300, maxChars: 5_000_000 };
