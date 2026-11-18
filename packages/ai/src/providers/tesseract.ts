import { spawn } from "node:child_process";
import { AppError } from "@hks/shared";
import type { PageReading, PageTextReader, ProviderDescriptor } from "./types.ts";

/**
 * Reads scanned pages with the Tesseract OCR engine, run as a local program.
 *
 * Unlike a language model it recognises characters and nothing else: a letter it cannot read
 * comes out as a wrong letter, never as an invented sentence. It makes no network call and
 * costs no tokens, so the budget figures are zero. The page image is passed on standard input
 * and never written to disk.
 *
 * Measured on one printed Hebrew page (see docs/DEPLOYMENT_SINGLE_HOST.md). Rashi script and
 * pages with several columns of different texts have not been measured.
 */
export class TesseractPageReader implements PageTextReader {
  readonly descriptor: ProviderDescriptor;
  readonly maxOutputTokensPerPage = 0;
  readonly estimatedInputTokensPerPage = 0;
  /** 72 dpi × 4.17 ≈ 300 dpi, the resolution Tesseract is trained for. */
  readonly renderScale = 300 / 72;
  private readonly command: string;
  private readonly languages: string;
  private readonly timeoutMs: number;

  constructor(options: { languages: string; command?: string; timeoutMs?: number }) {
    if (!/^[a-z_]+(\+[a-z_]+)*$/i.test(options.languages)) throw new AppError("not_configured", "OCR_LANGUAGES must look like heb+eng");
    this.languages = options.languages;
    this.command = options.command ?? "tesseract";
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.descriptor = { provider: "tesseract", modelId: `tesseract:${options.languages}`, kind: "live" };
  }

  readPage(png: Uint8Array, signal?: AbortSignal): Promise<PageReading> {
    return new Promise((resolve, reject) => {
      const fail = (cause: unknown) => reject(new AppError("extraction_failed", "The scanned page could not be read", { cause }));
      // "stdin stdout": image in, plain text out. --psm 3: automatic page segmentation.
      const child = spawn(this.command, ["stdin", "stdout", "-l", this.languages, "--psm", "3"], {
        stdio: ["pipe", "pipe", "ignore"],
        signal,
        timeout: this.timeoutMs,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2_000_000) child.kill(); // far more text than a page can hold
        else chunks.push(chunk);
      });
      child.on("error", fail);
      child.stdin.on("error", () => {}); // the exit code reports the failure
      child.on("close", (code) => {
        if (code !== 0) return fail(new Error(`tesseract exited with ${code}`));
        resolve({ text: Buffer.concat(chunks).toString("utf8").replace(/\f/g, "").trim(), truncated: false, inputTokens: 0, outputTokens: 0 });
      });
      child.stdin.end(Buffer.from(png));
    });
  }
}
