import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import type { Executor, TenantContext } from "./client.ts";
import {
  chunkEmbeddings,
  citations,
  documentChunks,
  documents,
  ingestionJobs,
  type DocumentStatus,
  type FileType,
} from "./schema.ts";

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof documentChunks.$inferSelect;
export type IngestionJobRow = typeof ingestionJobs.$inferSelect;

const scope = (ctx: TenantContext) =>
  and(eq(documents.organizationId, ctx.organizationId), eq(documents.workspaceId, ctx.workspaceId));

export async function createDocument(
  tx: Executor,
  ctx: TenantContext,
  input: {
    id?: string;
    uploadedByUserId: string | null;
    title: string;
    originalFilename: string;
    fileType: FileType;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    status: DocumentStatus;
  },
): Promise<DocumentRow> {
  const [row] = await tx
    .insert(documents)
    .values({ ...input, organizationId: ctx.organizationId, workspaceId: ctx.workspaceId })
    .returning();
  if (!row) throw new Error("document insert returned no row");
  return row;
}

export async function getDocument(tx: Executor, ctx: TenantContext, documentId: string): Promise<DocumentRow | null> {
  const [row] = await tx.select().from(documents).where(and(scope(ctx), eq(documents.id, documentId))).limit(1);
  return row ?? null;
}

export async function listDocuments(
  tx: Executor,
  ctx: TenantContext,
  options: { search?: string; limit?: number } = {},
): Promise<DocumentRow[]> {
  const term = options.search?.trim();
  // Escape LIKE wildcards so user input is matched literally.
  const pattern = term ? `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return tx
    .select()
    .from(documents)
    .where(
      and(
        scope(ctx),
        sql`${documents.status} <> 'deleting'`,
        pattern ? or(ilike(documents.title, pattern), ilike(documents.originalFilename, pattern)) : undefined,
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(Math.min(options.limit ?? 200, 500));
}

/** Documents added to the workspace's organization since `since` (for upload limits). */
export async function countDocumentsSince(tx: Executor, ctx: TenantContext, since: Date): Promise<number> {
  const [row] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(documents)
    .where(and(eq(documents.organizationId, ctx.organizationId), gte(documents.createdAt, since)));
  return Number(row?.n ?? 0);
}

export async function updateDocument(
  tx: Executor,
  ctx: TenantContext,
  documentId: string,
  patch: Partial<
    Pick<
      DocumentRow,
      "status" | "failureCode" | "failureDetail" | "contentSha256" | "language" | "pageCount" | "chunkCount" | "readyAt"
    >
  >,
): Promise<DocumentRow | null> {
  const [row] = await tx
    .update(documents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(scope(ctx), eq(documents.id, documentId)))
    .returning();
  return row ?? null;
}

export type NewChunk = {
  chunkIndex: number;
  pageNumber: number | null;
  pageEnd: number | null;
  sectionPath: string[] | null;
  text: string;
  searchText: string;
  tokenEstimate: number;
  chunkingVersion: string;
  embedding: number[];
};

const toVector = (values: number[]) => `[${values.join(",")}]`;

/**
 * Replaces a document's chunks and their vectors for one embedding index.
 * Runs inside the caller's transaction, so a document never has a partial set.
 */
export async function replaceChunks(
  tx: Executor,
  ctx: TenantContext,
  documentId: string,
  embeddingIndexId: string,
  chunks: NewChunk[],
): Promise<number> {
  await tx
    .delete(documentChunks)
    .where(and(eq(documentChunks.organizationId, ctx.organizationId), eq(documentChunks.documentId, documentId)));
  for (let start = 0; start < chunks.length; start += 100) {
    const batch = chunks.slice(start, start + 100);
    const inserted = await tx
      .insert(documentChunks)
      .values(
        batch.map((chunk) => ({
          organizationId: ctx.organizationId,
          workspaceId: ctx.workspaceId,
          documentId,
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
          pageEnd: chunk.pageEnd,
          sectionPath: chunk.sectionPath,
          text: chunk.text,
          searchText: chunk.searchText,
          charCount: chunk.text.length,
          tokenEstimate: chunk.tokenEstimate,
          chunkingVersion: chunk.chunkingVersion,
        })),
      )
      .returning({ id: documentChunks.id, chunkIndex: documentChunks.chunkIndex });
    const idByIndex = new Map(inserted.map((row) => [row.chunkIndex, row.id]));
    await tx.insert(chunkEmbeddings).values(
      batch.map((chunk) => ({
        chunkId: idByIndex.get(chunk.chunkIndex)!,
        embeddingIndexId,
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        documentId,
        embedding: sql`${toVector(chunk.embedding)}::vector` as unknown as number[],
      })),
    );
  }
  return chunks.length;
}

export async function getChunks(tx: Executor, ctx: TenantContext, chunkIds: string[]): Promise<ChunkRow[]> {
  if (chunkIds.length === 0) return [];
  return tx
    .select()
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.organizationId, ctx.organizationId),
        eq(documentChunks.workspaceId, ctx.workspaceId),
        inArray(documentChunks.id, chunkIds),
      ),
    );
}

/** Chunks of one document in reading order, optionally limited to one page. */
export async function listDocumentChunks(
  tx: Executor,
  ctx: TenantContext,
  documentId: string,
  options: { pageNumber?: number } = {},
): Promise<ChunkRow[]> {
  return tx
    .select()
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.organizationId, ctx.organizationId),
        eq(documentChunks.workspaceId, ctx.workspaceId),
        eq(documentChunks.documentId, documentId),
        options.pageNumber === undefined
          ? undefined
          : sql`${options.pageNumber} between ${documentChunks.pageNumber} and coalesce(${documentChunks.pageEnd}, ${documentChunks.pageNumber})`,
      ),
    )
    .orderBy(documentChunks.chunkIndex);
}

/* ------------------------------------------------------------------- jobs */

export async function createIngestionJob(
  tx: Executor,
  ctx: TenantContext,
  input: { documentId: string; correlationId: string; embeddingIndexId?: string | null },
): Promise<IngestionJobRow> {
  const [row] = await tx
    .insert(ingestionJobs)
    .values({
      organizationId: ctx.organizationId,
      documentId: input.documentId,
      status: "queued",
      correlationId: input.correlationId,
      embeddingIndexId: input.embeddingIndexId ?? null,
    })
    .returning();
  if (!row) throw new Error("job insert returned no row");
  return row;
}

export async function updateIngestionJob(
  tx: Executor,
  ctx: TenantContext,
  jobId: string,
  patch: Partial<
    Pick<
      IngestionJobRow,
      "status" | "step" | "progress" | "attempt" | "errorCode" | "errorDetail" | "startedAt" | "finishedAt" | "embeddingIndexId"
    >
  >,
) {
  await tx
    .update(ingestionJobs)
    .set(patch)
    .where(and(eq(ingestionJobs.organizationId, ctx.organizationId), eq(ingestionJobs.id, jobId)));
}

export async function latestIngestionJob(tx: Executor, ctx: TenantContext, documentId: string) {
  const [row] = await tx
    .select()
    .from(ingestionJobs)
    .where(and(eq(ingestionJobs.organizationId, ctx.organizationId), eq(ingestionJobs.documentId, documentId)))
    .orderBy(desc(ingestionJobs.queuedAt))
    .limit(1);
  return row ?? null;
}

/* --------------------------------------------------------------- deletion */

/**
 * Step 1 of deletion: from the moment this commits, the document cannot be
 * retrieved, because retrieval reads chunk_embeddings.
 */
export async function beginDocumentDeletion(tx: Executor, ctx: TenantContext, documentId: string) {
  const doc = await updateDocument(tx, ctx, documentId, { status: "deleting" });
  if (!doc) return null;
  await tx
    .delete(chunkEmbeddings)
    .where(and(eq(chunkEmbeddings.organizationId, ctx.organizationId), eq(chunkEmbeddings.documentId, documentId)));
  return doc;
}

/**
 * Step 2: tombstone citations (evidence text removed, title kept so the UI can
 * say which source is gone), then delete the row; chunks and jobs cascade.
 * Returns the storage key so the caller can remove the object afterwards.
 */
export async function finishDocumentDeletion(tx: Executor, ctx: TenantContext, documentId: string) {
  await tx
    .update(citations)
    .set({ sourceState: "removed", excerpt: null, sectionPath: null, pageNumber: null })
    .where(and(eq(citations.organizationId, ctx.organizationId), eq(citations.documentId, documentId)));
  const [deleted] = await tx
    .delete(documents)
    .where(and(scope(ctx), eq(documents.id, documentId)))
    .returning({ storageKey: documents.storageKey });
  return deleted?.storageKey ?? null;
}
