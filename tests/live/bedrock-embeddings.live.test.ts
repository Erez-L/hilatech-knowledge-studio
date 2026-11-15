/**
 * LIVE TEST - calls Amazon Bedrock InvokeModel for Cohere Embed Multilingual v3 (paid).
 * Skipped unless LIVE_BEDROCK_EMBEDDINGS=1. At most 14 adapter calls (about 13 HTTP requests) and 260 texts,
 * almost all of them one short sentence.
 * See docs/REAL_PROVIDER_VERIFICATION.md, steps 5 and 6.
 */
import { afterAll, expect, it } from "vitest";
import { BedrockCohereEmbeddings } from "../../packages/ai/src/index.ts";
import { bedrockRegion, CappedEmbeddings, cosine, l2Norm, liveGate, liveSuite, Observations, optionalEnv, round } from "./helpers.ts";

const gate = liveGate(
  "Amazon Bedrock Cohere embeddings adapter",
  "LIVE_BEDROCK_EMBEDDINGS",
  ["AWS_REGION|BEDROCK_REGION"],
  "EMBEDDINGS_MODEL_ID defaults to cohere.embed-multilingual-v3; AWS credentials from the default chain.",
);

const DIMENSIONS = 1024;
const MAX_CALLS = 14;
const MAX_TEXTS = 260;

liveSuite(gate, () => {
  const observations = new Observations("bedrock-embeddings");
  afterAll(() => observations.write());

  const modelId = optionalEnv("EMBEDDINGS_MODEL_ID") ?? "cohere.embed-multilingual-v3";
  // One budget shared by every provider instance in this file.
  const budget = { calls: 0, texts: 0 };
  const provider = (batchSize: number) => {
    const capped = new CappedEmbeddings(
      new BedrockCohereEmbeddings({ region: bedrockRegion(), modelId, dimensions: DIMENSIONS, batchSize }),
      MAX_CALLS,
      MAX_TEXTS,
    );
    capped.calls = budget.calls;
    capped.texts = budget.texts;
    return {
      embedDocuments: async (texts: string[]) => {
        try {
          return await capped.embedDocuments(texts);
        } finally {
          budget.calls = capped.calls;
          budget.texts = capped.texts;
        }
      },
      embedQuery: async (text: string) => {
        try {
          return await capped.embedQuery(text);
        } finally {
          budget.calls = capped.calls;
          budget.texts = capped.texts;
        }
      },
    };
  };

  const isFloatVector = (vector: number[]) => vector.every((value) => typeof value === "number" && Number.isFinite(value));

  it("returns 1024-dimensional float vectors for passages and for a query", async () => {
    const text = "Priority 1 tickets receive a first response within 30 minutes during business hours.";
    const embeddings = provider(96);
    const [asDocument] = await embeddings.embedDocuments([text]); // input_type search_document
    const asQuery = await embeddings.embedQuery(text); // input_type search_query
    expect(asDocument).toHaveLength(DIMENSIONS);
    expect(asQuery).toHaveLength(DIMENSIONS);
    expect(isFloatVector(asDocument!)).toBe(true);
    expect(isFloatVector(asQuery)).toBe(true);
    // Not integers in disguise (int8 output would be whole numbers).
    expect(asDocument!.some((value) => !Number.isInteger(value))).toBe(true);

    // Unit length is not required by cosine search; the observed norms are recorded.
    const norms = { search_document: round(l2Norm(asDocument!), 6), search_query: round(l2Norm(asQuery), 6) };
    observations.record("norms", norms);
    observations.soft("vectors are approximately unit length (within 1%)", Math.abs(norms.search_document - 1) < 0.01 && Math.abs(norms.search_query - 1) < 0.01, norms);
    expect(norms.search_document).toBeGreaterThan(0);
    expect(norms.search_query).toBeGreaterThan(0);

    // The two input types are expected to give different vectors for the same text; record how different.
    const sameTextCosine = round(cosine(asDocument!, asQuery), 4);
    observations.record("cosine(search_document, search_query) for the same text", sameTextCosine);
    observations.soft("search_query and search_document give different vectors for the same text", sameTextCosine < 0.9999, { sameTextCosine });
  });

  it("embedDocuments splits into batches and preserves input order across the batch boundary", async () => {
    // 100 texts with the maximum batch size (96) must be sent as two requests: the API accepts at most 96 texts per call.
    const texts = Array.from({ length: 100 }, (_, i) => `Inventory record ${i}: shelf ${i * 7 + 3}, bin ${(i * 13) % 50}.`);
    const all = await provider(96).embedDocuments(texts);
    expect(all).toHaveLength(100);
    for (const vector of all) expect(vector).toHaveLength(DIMENSIONS);

    // Re-embed a few positions on their own, including both sides of the 96/97 boundary, and match them up.
    const positions = [0, 1, 95, 96, 99];
    const again = await provider(96).embedDocuments(positions.map((i) => texts[i]!));
    const matches = positions.map((position, k) => ({
      position,
      same: round(cosine(all[position]!, again[k]!), 5),
      neighbour: round(cosine(all[position === 99 ? 98 : position + 1]!, again[k]!), 5),
    }));
    observations.record("orderCheck", matches);
    for (const match of matches) {
      expect(match.same).toBeGreaterThan(0.999);
      expect(match.same).toBeGreaterThan(match.neighbour);
    }

    // A small batch size must give the same vectors, in the same order (5 texts, batch size 2 -> 3 requests).
    const small = await provider(2).embedDocuments(texts.slice(0, 5));
    expect(small).toHaveLength(5);
    small.forEach((vector, i) => expect(cosine(vector, all[i]!)).toBeGreaterThan(0.999));
  });

  it("rejects a text longer than the adapter limit before any request is made", async () => {
    const before = budget.calls;
    const tooLong = "a ".repeat(1025); // 2,050 characters
    await expect(provider(96).embedDocuments(["short", tooLong])).rejects.toMatchObject({ code: "embedding_failed" });
    await expect(provider(96).embedQuery(tooLong)).rejects.toMatchObject({ code: "embedding_failed" });
    // The two attempts were counted by the cap wrapper, but the adapter rejected them locally.
    observations.record("overLong.attemptsCountedByCap", budget.calls - before);
  });

  it("never truncates silently: a long Hebrew passage is either embedded whole or rejected", async () => {
    // The documented limit is 512 tokens per text; 2,048 characters is the documented approximation
    // (about 4 characters per token, which is an English figure). Hebrew usually needs more tokens
    // per character, so a passage inside the character limit may still exceed the token limit.
    // With truncate=NONE the service should then return an error. This test finds out which happens.
    const sentence = "העובדים רשאים לעבוד מהבית עד שלושה ימים בשבוע, בתיאום מראש עם המנהל הישיר ובכפוף לצורכי הצוות. ";
    const passage = (chars: number, tail: string) => {
      const body = sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars - tail.length);
      return (body + tail).slice(0, chars);
    };
    const tailA = " סעיף אחרון: ההחזר השנתי ניתן בתוך שלושים יום ממועד הרכישה.";
    const tailB = " סעיף אחרון: החניון נסגר לשיפוצים בחודש מרץ ונפתח מחדש באפריל.";
    const outcomes: Record<string, unknown>[] = [];

    for (const chars of [2048, 1800, 1200]) {
      const a = passage(chars, tailA);
      const b = passage(chars, tailB);
      expect(a.length).toBeLessThanOrEqual(2048);
      try {
        const [va, vb] = await provider(96).embedDocuments([a, b]);
        // The two texts differ only in their last sentence. If the service had cut the end off,
        // the vectors would be identical.
        const similarity = cosine(va!, vb!);
        outcomes.push({ chars, result: "embedded", cosineBetweenTextsDifferingOnlyAtTheEnd: round(similarity, 6) });
        expect(similarity, `the end of a ${chars}-character text was ignored: silent truncation`).toBeLessThan(0.99999);
        break; // this size fits; smaller sizes need no probe
      } catch (error) {
        const code = (error as { code?: string }).code;
        const cause = ((error as { cause?: { name?: string } }).cause?.name) ?? null;
        if (code !== "embedding_failed" || cause === null) throw error; // an assertion failure or an unexpected error
        outcomes.push({ chars, result: "rejected by the provider", cause });
      }
    }
    observations.record("hebrewLengthProbe", outcomes);
    const first = outcomes[0]!;
    observations.soft(
      "a 2,048-character Hebrew passage is accepted (if not, chunk limits for Hebrew must be lowered; see the verification document)",
      first.result === "embedded",
      outcomes,
    );
  });

  it("places a Hebrew sentence nearer to its English translation than to unrelated sentences (observation)", async () => {
    // SOFT ASSERTION: this reports measured cosine values. It fails the run only with LIVE_STRICT=1.
    const texts = {
      he: "עובדים רשאים לעבוד מהבית עד שלושה ימים בשבוע.",
      en: "Employees may work from home up to three days per week.",
      unrelatedEn: "The cafeteria on the second floor closes for renovation in March.",
      unrelatedHe: "המזנון בקומה השנייה ייסגר לשיפוצים בחודש מרץ.",
    };
    const embeddings = provider(96);
    const [he, en, unrelatedEn, unrelatedHe] = await embeddings.embedDocuments(Object.values(texts));
    const heQuery = await embeddings.embedQuery("כמה ימים בשבוע מותר לעבוד מהבית?");
    const measured = {
      "he ~ en (translation pair)": round(cosine(he!, en!)),
      "he ~ unrelated en": round(cosine(he!, unrelatedEn!)),
      "he ~ unrelated he": round(cosine(he!, unrelatedHe!)),
      "en ~ unrelated en": round(cosine(en!, unrelatedEn!)),
      "en ~ unrelated he": round(cosine(en!, unrelatedHe!)),
      "unrelated en ~ unrelated he (second translation pair)": round(cosine(unrelatedEn!, unrelatedHe!)),
      "he question ~ he passage": round(cosine(heQuery, he!)),
      "he question ~ en passage (cross-language retrieval)": round(cosine(heQuery, en!)),
      "he question ~ unrelated he passage": round(cosine(heQuery, unrelatedHe!)),
      "he question ~ unrelated en passage": round(cosine(heQuery, unrelatedEn!)),
    };
    observations.record("crossLanguageCosines", measured);
    const pair = measured["he ~ en (translation pair)"];
    const others = [measured["he ~ unrelated en"], measured["he ~ unrelated he"], measured["en ~ unrelated en"], measured["en ~ unrelated he"]];
    observations.soft("translation pair is closer than every unrelated pairing", others.every((value) => pair > value), measured);
    observations.soft(
      "a Hebrew question ranks the English translation of its answer above unrelated passages",
      measured["he question ~ en passage (cross-language retrieval)"] > Math.max(measured["he question ~ unrelated he passage"], measured["he question ~ unrelated en passage"]),
      measured,
    );
    // Hard assertions are limited to shape.
    for (const vector of [he, en, unrelatedEn, unrelatedHe, heQuery]) expect(vector).toHaveLength(DIMENSIONS);
  });

  it("stayed within the call cap", () => {
    observations.record("embeddingCalls", budget);
    observations.record("modelId", modelId);
    expect(budget.calls).toBeLessThanOrEqual(MAX_CALLS);
    expect(budget.texts).toBeLessThanOrEqual(MAX_TEXTS);
  });
});
