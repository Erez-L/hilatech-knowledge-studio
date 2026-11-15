import { and, eq } from "drizzle-orm";
import { AppError } from "@hks/shared";
import type { Db } from "./client.ts";
import { EMBEDDING_DIMENSIONS, embeddingIndexes } from "./schema.ts";

export type EmbeddingDescriptor = {
  provider: string;
  modelId: string;
  dimensions: number;
  kind: "live" | "test_double";
};

/**
 * Returns the active index for this provider kind, creating it on first use.
 *
 * If an active index of the same kind exists for a DIFFERENT model or
 * dimension, this refuses: vectors from one model are never written under,
 * or compared with, another model's index. Switching models is an explicit
 * reindex, not a configuration change.
 */
export async function ensureActiveEmbeddingIndex(db: Db, descriptor: EmbeddingDescriptor) {
  if (descriptor.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new AppError(
      "not_configured",
      `Embedding model has ${descriptor.dimensions} dimensions; the vector column holds ${EMBEDDING_DIMENSIONS}`,
    );
  }
  const find = async () => {
    const [row] = await db
      .select()
      .from(embeddingIndexes)
      .where(and(eq(embeddingIndexes.kind, descriptor.kind), eq(embeddingIndexes.status, "active")))
      .limit(1);
    return row;
  };
  let active = await find();
  if (!active) {
    await db
      .insert(embeddingIndexes)
      .values({
        provider: descriptor.provider,
        modelId: descriptor.modelId,
        kind: descriptor.kind,
        dimensions: descriptor.dimensions,
        status: "active",
        activatedAt: new Date(),
      })
      .onConflictDoNothing(); // a concurrent process may have created it
    active = await find();
  }
  if (!active) throw new Error("could not create an embedding index");
  if (active.provider !== descriptor.provider || active.modelId !== descriptor.modelId || active.dimensions !== descriptor.dimensions) {
    throw new AppError(
      "not_configured",
      "The configured embedding model does not match the active index; a reindex is required before it can be used",
    );
  }
  return active;
}
