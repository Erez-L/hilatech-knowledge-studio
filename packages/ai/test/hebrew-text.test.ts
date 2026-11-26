import { describe, expect, it } from "vitest";
import { chunkBlocks, estimateCohereTokens, extractDocument, joinTextItems, type PdfTextItem } from "../src/index.ts";

/**
 * Hebrew PDF spacing, the Cohere token estimate for Hebrew, and token-aware chunking.
 * Every text here is written for these tests.
 */

/** A text item as pdf.js reports it: font size 12, at (x, y), `width` wide. */
const item = (str: string, x: number, width: number, y = 700, hasEOL = false): PdfTextItem => ({
  str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL,
});

describe("PDF text items are joined by position", () => {
  it("adds the space a producer left out between words, left to right", () => {
    expect(joinTextItems([item("Refunds", 72, 42), item("take", 118, 24), item("thirty", 146, 32), item("days.", 182, 28, 700, true)])).toBe("Refunds take thirty days.\n");
  });

  it("adds it on a right-to-left line too, where each word sits to the left of the one before", () => {
    // Logical order, as pdf.js reports Hebrew items: the first word is the rightmost.
    const line = [item("החזר", 480, 30), item("מלא", 444, 26), item("בתוך", 404, 30), item("שלושים", 350, 44), item("יום.", 316, 24, 700, true)];
    expect(joinTextItems(line)).toBe("החזר מלא בתוך שלושים יום.\n");
  });

  it("does not split a word drawn in pieces, and does not double a space the producer kept", () => {
    // "Purchase" in two touching pieces (a font change or kerning), then items that carry their own spaces.
    expect(joinTextItems([item("Pur", 72, 18), item("chase", 90, 30), item(" date", 124, 28)])).toBe("Purchase date");
    expect(joinTextItems([item("ממו", 300, 20), item("עד", 281, 19.5)])).toBe("ממועד");
    expect(joinTextItems([item("one ", 72, 24), item("two", 100, 18)])).toBe("one two");
  });

  it("starts a new line when the next item is lower on the page, even without an end-of-line mark", () => {
    expect(joinTextItems([item("First line", 72, 60, 700), item("Second line", 72, 66, 684)])).toBe("First line\nSecond line");
    // Empty items carrying only an end-of-line mark keep the line structure.
    expect(joinTextItems([item("a", 72, 6), { ...item("", 0, 0), hasEOL: true }, item("b", 72, 6, 686)])).toBe("a\nb");
  });

  it("spaces words in a real PDF whose words are drawn one by one without space characters", async () => {
    const pdf = minimalPdf([
      ["Annual", 72, 720], ["plans", 128, 720], ["renew", 172, 720], ["every", 222, 720], ["year.", 268, 720],
      ["Cancel", 72, 700], ["before", 130, 700], ["renewal.", 182, 700],
    ]);
    const doc = await extractDocument(pdf, "pdf");
    expect(doc.blocks[0]!.text).toContain("Annual plans renew every year.");
    expect(doc.blocks[0]!.text).toContain("Cancel before renewal.");
  });
});

describe("Cohere token estimate for Hebrew", () => {
  // The sentence of the live length probe (tests/live/bedrock-embeddings.live.test.ts). Measured on
  // Bedrock (docs/VERIFICATION_RUN_2026-11-17.md): 1,500 characters of it were accepted under the
  // 512-token limit, 1,800 were rejected.
  const probe = "העובדים רשאים לעבוד מהבית עד שלושה ימים בשבוע, בתיאום מראש עם המנהל הישיר ובכפוף לצורכי הצוות. ";
  const repeatTo = (text: string, chars: number) => text.repeat(Math.ceil(chars / text.length)).slice(0, chars);

  it("stays at or above what the live measurement allows", () => {
    // Rejected at 1,800 characters, so the true count there is over 512: the estimate must be too.
    expect(estimateCohereTokens(repeatTo(probe, 1800))).toBeGreaterThan(512);
    // Accepted at 1,500, so the true count is at most 512 there: the estimate must not be lower
    // per character than 512 / 1,500, or a text it calls short enough could be rejected.
    const perChar = estimateCohereTokens(probe.repeat(40)) / (probe.length * 40);
    expect(perChar).toBeGreaterThanOrEqual(512 / 1500);
  });

  it("counts one token per Hebrew word plus one per 3 letters, and one per vowel mark", () => {
    expect(estimateCohereTokens("ו")).toBe(3); // one token plus the two markers
    expect(estimateCohereTokens("ממועד")).toBe(2 + 2);
    const pointed = "שָׁלוֹם";
    expect(estimateCohereTokens(pointed)).toBeGreaterThan(estimateCohereTokens("שלום") + 3);
    const words = probe.repeat(10);
    expect(estimateCohereTokens(words)).toBeGreaterThanOrEqual(words.trim().split(/\s+/).length);
  });

  it("lets a default-size Hebrew chunk through whole instead of halving it", () => {
    // About 1,000 characters of prose: under the old estimate (1.5 characters per token) it was
    // over the 400-token target and was cut in two without overlap.
    const chunk = repeatTo(probe, 1000);
    expect(estimateCohereTokens(chunk)).toBeLessThanOrEqual(400);
  });
});

describe("chunking with a token limit", () => {
  const sentence = "לקוחות בתוכנית השנתית זכאים להחזר מלא בתוך שלושים יום ממועד הרכישה, בכפוף לאישור ראש הצוות. ";
  const english = "Annual plans are refunded in full within thirty days of purchase, subject to team lead approval. ";
  const options = { targetChars: 1200, maxChars: 1800, overlapChars: 200 };
  const tokens = { max: 400, estimate: estimateCohereTokens };

  it("packs Hebrew chunks to the limit, keeps the overlap, and never passes the limit", () => {
    const text = Array.from({ length: 12 }, () => sentence.repeat(3).trim()).join("\n\n");
    const chunks = chunkBlocks([{ text, pageNumber: 3, sectionPath: null }], { ...options, tokens });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(estimateCohereTokens(chunk.text)).toBeLessThanOrEqual(400);
    // Not cut in half: every chunk but the last is more than half the character target.
    for (const chunk of chunks.slice(0, -1)) expect(chunk.text.length).toBeGreaterThan(options.targetChars / 2);
    // Each chunk after the first starts with the end of the one before (the overlap).
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i]!.text.slice(0, 40);
      expect(chunks[i - 1]!.text).toContain(head);
    }
    expect(chunks.every((c) => c.pageNumber === 3)).toBe(true);
    expect(chunks[0]!.chunkingVersion).toBe("v3:1200/1800/200/t400");
  });

  it("splits a single over-long Hebrew paragraph at sentence ends, so each piece fits with room for the overlap", () => {
    const text = sentence.repeat(30).trim();
    const chunks = chunkBlocks([{ text, pageNumber: null, sectionPath: ["החזרים"] }], { ...options, tokens });
    for (const chunk of chunks) {
      expect(estimateCohereTokens(chunk.text)).toBeLessThanOrEqual(400);
      expect(chunk.text.replaceAll(sentence.trim(), "").trim(), "only whole sentences").toBe("");
      expect(chunk.sectionPath).toEqual(["החזרים"]);
    }
    expect(chunks.slice(1).every((c, i) => chunks[i]!.text.endsWith(c.text.slice(0, sentence.trim().length)))).toBe(true);
  });

  it("sizes English the same way: long English chunks are packed to the limit instead of being halved later", () => {
    const text = Array.from({ length: 6 }, () => english.repeat(5).trim()).join("\n\n");
    const chunks = chunkBlocks([{ text, pageNumber: 1, sectionPath: null }], { ...options, tokens });
    for (const chunk of chunks) expect(estimateCohereTokens(chunk.text)).toBeLessThanOrEqual(400);
    for (const chunk of chunks.slice(0, -1)) expect(chunk.text.length).toBeGreaterThan(options.targetChars / 2);
    // Short text is not affected by the limit at all.
    const short = [{ text: english.repeat(3).trim(), pageNumber: 1, sectionPath: null }];
    expect(chunkBlocks(short, { ...options, tokens }).map((c) => c.text)).toEqual(chunkBlocks(short, options).map((c) => c.text));
  });
});

/**
 * A one-page PDF that draws each word with its own text operator and no space characters,
 * the way many producers write Hebrew. Helvetica needs no embedded font.
 */
function minimalPdf(words: [string, number, number][]): Uint8Array {
  const stream = words.map(([word, x, y]) => `BT /F1 12 Tf ${x} ${y} Td (${word}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
