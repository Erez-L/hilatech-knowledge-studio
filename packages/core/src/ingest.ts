import { createHash, randomUUID } from "node:crypto";
import {
  chunkBlocks,
  EmbeddingInputTooLongError,
  splitChunkToFit,
  detectFileType,
  detectLanguage,
  extractDocument,
  type Chunk,
} from "@hks/ai";
import {
  beginDocumentDeletion,
  createDocument,
  deleteDocumentSummaries,
  createIngestionJob,
  ensureActiveEmbeddingIndex,
  finishDocumentDeletion,
  getDocument,
  recordAudit,
  recordUsage,
  replaceChunks,
  updateDocument,
  updateIngestionJob,
  withTenant,
  type DocumentRow,
  type TenantContext,
} from "@hks/database";
import { AppError, isAppError, log, type ErrorCode } from "@hks/shared";
import { actorFields, type Actor, type IngestionJobData, type Services } from "./services.ts";
import { newStorageKey } from "./storage.ts";
import { reserveAiBudget, settleAiBudget } from "./budget.ts";

/** Failures that will not succeed on retry: the file itself is the problem. */
const PERMANENT: ReadonlySet<ErrorCode> = new Set([
  "unsupported_file_type", "unsupported_scanned_pdf", "malformed_file", "duplicate_document",
  "extraction_failed", "too_many_pages", "payload_too_large", "not_found", "not_configured",
  "budget_exceeded", // retrying today cannot help; the owner retries after the budget resets
]);
export const isPermanentFailure = (error: unknown) => isAppError(error) && PERMANENT.has(error.code);

function displayTitle(filename: string): { title: string; filename: string } {
  // Keep only the last path segment, drop control characters, bound the length.
  const base = filename.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, "").trim().slice(0, 255) || "document";
  // A readable title from the file name: "refund-and_policy.pdf" → "Refund and policy".
  const stem = clean.replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || clean;
  const title = stem.charAt(0).toLocaleUpperCase() + stem.slice(1);
  return { title: title.slice(0, 255), filename: clean };
}

/**
 * Accepts an upload: validates it on the server, stores it privately, records
 * the document, and queues ingestion. The document is NOT ready when this
 * returns; it becomes ready only after extraction and indexing succeed.
 */
export async function uploadDocument(
  services: Services,
  ctx: TenantContext,
  actor: Actor,
  input: { filename: string; bytes: Uint8Array; correlationId: string },
): Promise<DocumentRow> {
  const { config, db, storage, queue } = services;
  if (!services.embeddings) throw new AppError("provider_not_configured", "Document indexing is not configured");
  if (input.bytes.byteLength === 0) throw new AppError("validation", "The file is empty");
  if (input.bytes.byteLength > config.UPLOAD_MAX_BYTES) {
    throw new AppError("payload_too_large", `Files can be up to ${Math.floor(config.UPLOAD_MAX_BYTES / (1024 * 1024))} MB`);
  }
  const { fileType, mimeType } = detectFileType(input.bytes, input.filename);
  const { title, filename } = displayTitle(input.filename);
  const storageKey = newStorageKey(ctx.organizationId);

  await storage.put(storageKey, input.bytes, mimeType);
  try {
    const { document, job } = await withTenant(db, ctx.organizationId, async (tx) => {
      const document = await createDocument(tx, ctx, {
        uploadedByUserId: actor.kind === "user" ? actor.userId : null,
        title,
        originalFilename: filename,
        fileType,
        mimeType,
        sizeBytes: input.bytes.byteLength,
        storageKey,
        status: "queued",
      });
      const job = await createIngestionJob(tx, ctx, { documentId: document.id, correlationId: input.correlationId });
      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        ...actorFields(actor),
        action: "document.uploaded",
        targetType: "document",
        targetId: document.id,
        outcome: "success",
        metadata: { fileType, sizeBytes: input.bytes.byteLength },
        correlationId: input.correlationId,
      });
      return { document, job };
    });
    await queue.enqueueIngestion({
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      documentId: document.id,
      jobId: job.id,
      correlationId: input.correlationId,
    });
    return document;
  } catch (error) {
    await storage.delete(storageKey).catch(() => {});
    throw error;
  }
}

/**
 * Runs one ingestion job: extract → chunk → embed → store → Ready.
 * Throws on failure after recording it; the caller decides whether to retry
 * (see isPermanentFailure). `finalAttempt` marks the document failed for
 * errors that could otherwise be retried.
 */
export async function ingestDocument(services: Services, data: IngestionJobData, options: { attempt: number; finalAttempt: boolean }) {
  const { config, db, storage, embeddings } = services;
  const ctx: TenantContext = { organizationId: data.organizationId, workspaceId: data.workspaceId };
  const tenant = <T>(work: Parameters<typeof withTenant<T>>[2]) => withTenant(db, ctx.organizationId, work);
  let reindexing = false;
  const step = (name: NonNullable<Parameters<typeof updateIngestionJob>[3]["step"]>, progress: number) =>
    tenant((tx) => updateIngestionJob(tx, ctx, data.jobId, { step: name, progress }));

  try {
    if (!embeddings) throw new AppError("not_configured", "No embeddings provider is configured");
    const document = await tenant((tx) => getDocument(tx, ctx, data.documentId));
    if (!document || document.status === "deleting") throw new AppError("not_found", "The document no longer exists");
    reindexing = Boolean(data.reindex) && document.status === "ready";
    if (document.status === "ready" && !reindexing) return; // already done (duplicate delivery)

    await tenant((tx) =>
      updateIngestionJob(tx, ctx, data.jobId, { status: "running", step: "validating", progress: 5, attempt: options.attempt, startedAt: new Date() }),
    );
    const bytes = await storage.get(document.storageKey).catch((error) => {
      // A missing object must not look like a missing document: mark the document failed.
      if (isAppError(error) && error.code === "not_found") throw new AppError("extraction_failed", "The stored file is missing");
      throw error;
    });
    const { fileType } = detectFileType(bytes, document.originalFilename); // re-validate what was actually stored
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    try {
      // A re-index keeps the document Ready (and searchable) until the new passages are stored.
      if (!reindexing) {
        await tenant((tx) => updateDocument(tx, ctx, document.id, { status: "processing", contentSha256: sha256, failureCode: null, failureDetail: null }));
      }
    } catch (error) {
      if (uniqueViolation(error, "documents_no_duplicates")) {
        throw new AppError("duplicate_document", "This file has already been added to the workspace");
      }
      throw error;
    }

    await step("extracting", 15);
    const reader = services.pageReader ?? null;
    const ocr = { pages: 0, inputTokens: 0, outputTokens: 0, truncated: 0 };
    const extracted = await extractDocument(
      bytes,
      fileType,
      { maxPages: config.UPLOAD_MAX_PAGES, maxChars: 5_000_000 },
      reader
        ? {
            maxPages: config.OCR_MAX_PAGES,
            renderScale: reader.renderScale,
            // One paid model call per scanned page. Budget is reserved before each call and
            // settled with what the provider reports, so a long scan stops when the budget does.
            readPage: async (png) => {
              const estimate = { inputTokens: reader.estimatedInputTokensPerPage, outputTokens: reader.maxOutputTokensPerPage };
              const reservation = await reserveAiBudget(services, ctx.organizationId, estimate, "reading this scanned document");
              let reading;
              try {
                reading = await reader.readPage(png);
              } catch (error) {
                // The call may have been charged; keep the input estimate, release the output.
                await settleAiBudget(services, reservation, { inputTokens: estimate.inputTokens, outputTokens: 0 });
                throw error;
              }
              const used = { inputTokens: reading.inputTokens ?? estimate.inputTokens, outputTokens: reading.outputTokens ?? estimate.outputTokens };
              await settleAiBudget(services, reservation, used);
              ocr.pages += 1;
              ocr.inputTokens += used.inputTokens;
              ocr.outputTokens += used.outputTokens;
              if (reading.truncated) ocr.truncated += 1;
              return reading.text;
            },
          }
        : undefined,
    ).finally(async () => {
      // Recorded even when a later page fails: the calls already made were paid for.
      if (!reader || ocr.pages === 0) return;
      await tenant((tx) =>
        recordUsage(tx, {
          organizationId: ctx.organizationId,
          workspaceId: ctx.workspaceId,
          userId: document.uploadedByUserId,
          kind: "document_ocr",
          provider: reader.descriptor.provider,
          modelId: reader.descriptor.modelId,
          providerKind: reader.descriptor.kind,
          inputTokens: ocr.inputTokens,
          outputTokens: ocr.outputTokens,
          units: ocr.pages,
          documentId: document.id,
          correlationId: data.correlationId,
        }),
      ).catch(() => {});
      log(ocr.truncated ? "warn" : "info", "ingestion.scanned_pages_read", {
        documentId: document.id, pages: ocr.pages, truncatedPages: ocr.truncated, correlationId: data.correlationId,
      });
    });

    await step("chunking", 35);
    const maxChars = Math.min(config.CHUNK_MAX_CHARS, embeddings.maxCharsPerText);
    const targetChars = Math.min(config.CHUNK_TARGET_CHARS, maxChars);
    const tokenLimit = embeddings.estimateTokens && embeddings.maxTokensPerText
      ? { max: embeddings.maxTokensPerText, estimate: embeddings.estimateTokens }
      : undefined;
    const chunks = chunkBlocks(extracted.blocks, {
      targetChars,
      maxChars,
      overlapChars: Math.min(config.CHUNK_OVERLAP_CHARS, maxChars - targetChars),
      tokens: tokenLimit,
    });
    if (chunks.length === 0) throw new AppError("extraction_failed", "No text was found in the file");

    await step("embedding", 45);
    const index = await ensureActiveEmbeddingIndex(db, embeddings.descriptor);
    // The chunker already packs to the token limit; this only catches what it could not
    // (a provider without an estimate, or a single unbreakable run of text).
    const fits = (text: string) =>
      text.length <= embeddings.maxCharsPerText &&
      (!embeddings.estimateTokens || !embeddings.maxTokensPerText || embeddings.estimateTokens(text) <= embeddings.maxTokensPerText);
    const sized = chunks.flatMap((chunk) => splitChunkToFit(chunk, fits));
    // Reserve the whole document's estimated tokens before the first call. Every attempt reserves
    // again, so a retry can only spend what the budget still allows.
    const reservation = await reserveAiBudget(
      services, ctx.organizationId, { inputTokens: sized.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0), outputTokens: 0 }, "indexing this document",
    );
    const progress = { called: false };
    let embedded: { chunk: Chunk; vector: number[] }[];
    try {
      embedded = await embedAdaptively(services, sized, progress, async (done) => {
        await step("embedding", 45 + Math.round((done / sized.length) * 45));
      });
    } catch (error) {
      // Nothing was sent: give the reservation back. Otherwise keep it, since the provider may have charged.
      if (!progress.called) await settleAiBudget(services, reservation, { inputTokens: 0, outputTokens: 0 });
      throw error;
    }
    // What is stored is exactly what was embedded: one vector per final chunk, renumbered in order.
    chunks.length = 0;
    chunks.push(...embedded.map(({ chunk }, i) => ({ ...chunk, chunkIndex: i })));
    const vectors = embedded.map(({ vector }) => vector);
    await settleAiBudget(services, reservation, { inputTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0), outputTokens: 0 });

    await step("persisting", 92);
    await tenant(async (tx) => {
      // The document may have been deleted while we were embedding.
      const current = await getDocument(tx, ctx, document.id);
      if (!current || current.status === "deleting") throw new AppError("not_found", "The document was deleted during processing");
      await replaceChunks(tx, ctx, document.id, index.id, chunks.map((chunk, i) => ({ ...chunk, embedding: vectors[i]! })));
      // A saved summary points at passages by id and offset; after re-chunking those are gone.
      if (reindexing) await deleteDocumentSummaries(tx, ctx, document.id);
      await updateDocument(tx, ctx, document.id, {
        status: "ready",
        chunkCount: chunks.length,
        pageCount: extracted.pageCount,
        language: detectLanguage(extracted.blocks.map((b) => b.text).join(" ").slice(0, 20_000)),
        readyAt: new Date(),
      });
      await updateIngestionJob(tx, ctx, data.jobId, { status: "succeeded", step: "persisting", progress: 100, finishedAt: new Date(), embeddingIndexId: index.id });
      await recordUsage(tx, {
        organizationId: ctx.organizationId,
        workspaceId: ctx.workspaceId,
        userId: document.uploadedByUserId,
        kind: "document_embedding",
        provider: embeddings.descriptor.provider,
        modelId: embeddings.descriptor.modelId,
        providerKind: embeddings.descriptor.kind,
        inputTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0),
        units: chunks.length,
        documentId: document.id,
        correlationId: data.correlationId,
      });
    });
    log("info", "ingestion.succeeded", { documentId: document.id, chunks: chunks.length, reindex: reindexing, correlationId: data.correlationId });
  } catch (error) {
    const permanent = isPermanentFailure(error);
    const code: ErrorCode = isAppError(error) ? error.code : "internal";
    // The detail is one of our own fixed messages, never document text or a driver error.
    const detail = isAppError(error) ? (error.detail ?? null) : "Unexpected error while processing the file";
    log(permanent ? "warn" : "error", "ingestion.failed", { documentId: data.documentId, code, attempt: options.attempt, correlationId: data.correlationId });
    if (permanent || options.finalAttempt) {
      await tenant(async (tx) => {
        await updateIngestionJob(tx, ctx, data.jobId, { status: "failed", errorCode: code, errorDetail: detail, finishedAt: new Date() });
        // A failed re-index leaves the document Ready with its earlier passages.
        if (reindexing) return;
        // If the document row is already gone this updates nothing.
        await updateDocument(tx, ctx, data.documentId, {
          status: code === "unsupported_scanned_pdf" || code === "unsupported_file_type" ? "unsupported" : "failed",
          failureCode: code,
          failureDetail: detail,
        });
      }).catch(() => {});
    }
    throw error;
  }
}

/** How many times one passage may be split further after the provider itself rejects it as too long. */
const MAX_PROVIDER_SPLITS = 3;

/**
 * Embeds chunks in batches. When the provider rejects a batch as too long, the batch is retried
 * one chunk at a time to find the offender, and that chunk is split in two and retried, at most
 * MAX_PROVIDER_SPLITS levels deep; after that the document fails. Text is never truncated, and
 * each returned vector belongs to exactly the chunk it is paired with.
 */
async function embedAdaptively(services: Services, chunks: Chunk[], progress: { called: boolean }, onProgress: (done: number) => Promise<void>) {
  const embeddings = services.embeddings!;
  const size = services.config.EMBEDDINGS_BATCH_SIZE;
  const out: { chunk: Chunk; vector: number[] }[] = [];

  const embed = async (batch: Chunk[], depth: number): Promise<{ chunk: Chunk; vector: number[] }[]> => {
    let result: number[][];
    try {
      progress.called = true;
      result = await embeddings.embedDocuments(batch.map((chunk) => chunk.text));
    } catch (error) {
      if (error instanceof EmbeddingInputTooLongError) {
        if (batch.length > 1) {
          const each: { chunk: Chunk; vector: number[] }[] = [];
          for (const chunk of batch) each.push(...(await embed([chunk], depth)));
          return each;
        }
        const halves = depth < MAX_PROVIDER_SPLITS ? splitChunkToFit(batch[0]!, (text) => text.length <= Math.ceil(batch[0]!.text.length / 2)) : [];
        if (halves.length > 1) {
          const pieces: { chunk: Chunk; vector: number[] }[] = [];
          for (const half of halves) pieces.push(...(await embed([half], depth + 1)));
          return pieces;
        }
        throw new AppError("embedding_failed", "A passage is too long for the embeddings model and could not be split further", { cause: error });
      }
      if (isAppError(error)) throw error;
      throw new AppError("embedding_failed", "The embeddings provider failed", { cause: error });
    }
    if (result.length !== batch.length || result.some((v) => v.length !== embeddings.descriptor.dimensions)) {
      throw new AppError("embedding_failed", "The embeddings provider returned an unexpected result");
    }
    return batch.map((chunk, i) => ({ chunk, vector: result[i]! }));
  };

  for (let start = 0; start < chunks.length; start += size) {
    out.push(...(await embed(chunks.slice(start, start + size), 0)));
    await onProgress(Math.min(start + size, chunks.length));
  }
  return out;
}

function uniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
  return cause?.code === "23505" && cause.constraint === constraint;
}

/** Queues a failed document again, as a new job. */
export async function retryIngestion(services: Services, ctx: TenantContext, documentId: string, correlationId: string) {
  const job = await withTenant(services.db, ctx.organizationId, async (tx) => {
    const document = await getDocument(tx, ctx, documentId);
    if (!document) throw new AppError("not_found");
    if (document.status !== "failed") throw new AppError("conflict", "Only failed documents can be retried");
    await updateDocument(tx, ctx, documentId, { status: "queued", failureCode: null, failureDetail: null });
    return createIngestionJob(tx, ctx, { documentId, correlationId });
  });
  await services.queue.enqueueIngestion({ ...ctx, documentId, jobId: job.id, correlationId });
}

/**
 * Queues a Ready document to be indexed again with the current extraction and chunking rules
 * (operators run this through scripts/reindex-documents.mts). It costs embedding tokens like an
 * upload and is reserved against the organization's daily budget the same way. The document
 * stays Ready while the job runs; old conversations keep their stored citation excerpts.
 */
export async function reindexDocument(services: Services, ctx: TenantContext, documentId: string, correlationId: string) {
  const job = await withTenant(services.db, ctx.organizationId, async (tx) => {
    const document = await getDocument(tx, ctx, documentId);
    if (!document) throw new AppError("not_found");
    if (document.status !== "ready") throw new AppError("conflict", "Only ready documents can be indexed again");
    return createIngestionJob(tx, ctx, { documentId, correlationId });
  });
  await services.queue.enqueueIngestion({ ...ctx, documentId, jobId: job.id, correlationId, reindex: true });
  return job;
}

/**
 * Deletes a document. Order matters:
 *  1. vectors are removed and the row marked deleting — retrieval stops at once;
 *  2. citations are tombstoned and the row deleted (chunks cascade);
 *  3. the stored file is removed.
 * If step 3 fails the file is orphaned but unreachable; it is logged for a sweep.
 */
export async function deleteDocument(services: Services, ctx: TenantContext, actor: Actor, documentId: string, correlationId: string) {
  const { db, storage } = services;
  const document = await withTenant(db, ctx.organizationId, (tx) => beginDocumentDeletion(tx, ctx, documentId));
  if (!document) throw new AppError("not_found");
  const storageKey = await withTenant(db, ctx.organizationId, async (tx) => {
    const key = await finishDocumentDeletion(tx, ctx, documentId);
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      ...actorFields(actor),
      action: "document.deleted",
      targetType: "document",
      targetId: documentId,
      outcome: "success",
      correlationId,
    });
    return key;
  });
  if (storageKey) {
    await storage.delete(storageKey).catch(() => {
      log("error", "storage.delete_failed", { documentId, correlationId, sweepId: randomUUID() });
    });
  }
}
