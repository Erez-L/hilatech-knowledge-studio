import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseConfig } from "@hks/shared";
import { extractDocument, measureZipExpansion, openPdfRenderer, renderPdfPage } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = (edition: "en" | "he", name: string) => readFile(path.join(here, "..", "..", "..", "samples", "northstar", edition, name));
const codeOf = async (work: () => unknown) => {
  try {
    await work();
    return "no error";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
};

/** A ZIP with one deflated entry whose central directory declares `declaredSize`. */
function zipWith(content: Uint8Array, declaredSize: number): Uint8Array {
  const name = new TextEncoder().encode("word/document.xml");
  const data = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(declaredSize, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(declaredSize, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const directoryOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  return new Uint8Array(Buffer.concat([local, name, data, central, name, end]));
}

describe("Word document expansion cap", () => {
  it("measures the real inflated size of a well-formed document", async () => {
    const docx = new Uint8Array(await sample("en", "employee-onboarding-guide.docx"));
    const size = measureZipExpansion(docx, 64 * 1024 * 1024);
    expect(size).toBeGreaterThan(docx.byteLength);
  });

  it("refuses an archive that inflates to more than it declares, without inflating it all", async () => {
    // 4 MB of zeros compress to a few KB; the directory claims 100 bytes.
    const lying = zipWith(new Uint8Array(4 * 1024 * 1024), 100);
    expect(lying.byteLength).toBeLessThan(64 * 1024);
    expect(await codeOf(() => measureZipExpansion(lying, 64 * 1024 * 1024))).toBe("malformed_file");
  });

  it("refuses an honest archive that inflates past the cap", async () => {
    const big = zipWith(new Uint8Array(2 * 1024 * 1024), 2 * 1024 * 1024);
    expect(measureZipExpansion(big, 4 * 1024 * 1024)).toBe(2 * 1024 * 1024);
    expect(await codeOf(() => measureZipExpansion(big, 1024 * 1024))).toBe("malformed_file");
  });

  it("is applied before the Word parser runs", async () => {
    const lying = zipWith(new TextEncoder().encode(`<w:document>${"x".repeat(5000)}</w:document>`), 10);
    expect(await codeOf(() => extractDocument(lying, "docx"))).toBe("malformed_file");
  });
});

describe("scanned pages are rendered from one opened PDF", () => {
  it("renders the same image as opening the file for each page", async () => {
    const bytes = new Uint8Array(await readFile(path.join(here, "fixtures", "scanned-no-text-layer.pdf")));
    const renderer = await openPdfRenderer(bytes);
    try {
      const once = await renderer.render(1, 1);
      expect(Buffer.from(once).equals(Buffer.from(await renderPdfPage(bytes, 1, 1)))).toBe(true);
      // The same open document renders again (a second page of a longer scan works the same way).
      expect((await renderer.render(1, 1)).byteLength).toBe(once.byteLength);
    } finally {
      await renderer.close();
    }
  });

  it("reads every scanned page through the page reader", async () => {
    const bytes = new Uint8Array(await readFile(path.join(here, "fixtures", "scanned-no-text-layer.pdf")));
    const seen: number[] = [];
    const doc = await extractDocument(bytes, "pdf", undefined, {
      maxPages: 5,
      renderScale: 1,
      readPage: async (png, pageNumber) => {
        expect(png.byteLength).toBeGreaterThan(100);
        seen.push(pageNumber);
        return `Text read from page ${pageNumber}.`;
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(doc.ocrPages).toEqual(seen);
  });
});

describe("worker settings", () => {
  it("parses WORKER_CONCURRENCY and INGESTION_STUCK_MINUTES with safe bounds", () => {
    expect(parseConfig({ APP_ENV: "test" })).toMatchObject({ WORKER_CONCURRENCY: 2, INGESTION_STUCK_MINUTES: 30 });
    expect(parseConfig({ APP_ENV: "test", WORKER_CONCURRENCY: "1" }).WORKER_CONCURRENCY).toBe(1);
    expect(() => parseConfig({ APP_ENV: "test", WORKER_CONCURRENCY: "0" })).toThrow();
    expect(() => parseConfig({ APP_ENV: "test", WORKER_CONCURRENCY: "64" })).toThrow();
    expect(() => parseConfig({ APP_ENV: "test", INGESTION_STUCK_MINUTES: "1" })).toThrow();
  });
});
