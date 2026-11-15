import { AppError } from "@hks/shared";
import type { FileType } from "./types.ts";

const MIME: Record<FileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

/**
 * Decides the file type from the BYTES, then requires the filename extension
 * to agree. The browser-supplied MIME type is never trusted.
 */
export function detectFileType(bytes: Uint8Array, filename: string): { fileType: FileType; mimeType: string } {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  let detected: FileType | null = null;

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) detected = "pdf"; // %PDF-
  else if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const zip = inspectZip(bytes);
    if (!zip.names.includes("word/document.xml")) throw new AppError("unsupported_file_type", "Not a Word document");
    detected = "docx";
  } else if (isPlainText(bytes)) detected = extension === "md" || extension === "markdown" ? "md" : "txt";

  if (!detected) throw new AppError("unsupported_file_type", "Only PDF, DOCX, TXT and Markdown files are supported");
  const allowed: Record<FileType, string[]> = { pdf: ["pdf"], docx: ["docx"], txt: ["txt", "text"], md: ["md", "markdown"] };
  if (!allowed[detected].includes(extension)) {
    throw new AppError("unsupported_file_type", "The file extension does not match the file's content");
  }
  return { fileType: detected, mimeType: MIME[detected] };
}

const startsWith = (bytes: Uint8Array, magic: number[]) => magic.every((b, i) => bytes[i] === b);

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export const ZIP_LIMITS = { maxEntries: 5000, maxUncompressedBytes: 200 * 1024 * 1024, maxRatio: 200 };

/**
 * Reads a ZIP's central directory without decompressing anything, and rejects
 * archives that would expand unreasonably (zip bombs) before a parser sees them.
 */
export function inspectZip(bytes: Uint8Array): { names: string[]; uncompressedBytes: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new AppError("malformed_file", "The file is not a valid archive");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || offset === 0xffffffff) throw new AppError("malformed_file", "ZIP64 archives are not supported");
  if (entries > ZIP_LIMITS.maxEntries) throw new AppError("malformed_file", "The archive has too many entries");

  const names: string[] = [];
  let uncompressedBytes = 0;
  const decoder = new TextDecoder();
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new AppError("malformed_file", "The archive directory is damaged");
    }
    uncompressedBytes += view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (uncompressedBytes > ZIP_LIMITS.maxUncompressedBytes || uncompressedBytes > bytes.length * ZIP_LIMITS.maxRatio) {
    throw new AppError("malformed_file", "The archive expands to an unreasonable size");
  }
  return { names, uncompressedBytes };
}
