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
};

export type ExtractionLimits = { maxPages: number; maxChars: number };
export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = { maxPages: 300, maxChars: 5_000_000 };
