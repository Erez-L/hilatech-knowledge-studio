import "server-only";
import type { CitationRow, ConversationRow, DocumentRow, IngestionJobRow, MessageRow } from "@hks/database";

/** What the API returns for a document. Storage keys and hashes never leave the server. */
export function documentView(doc: DocumentRow, job?: IngestionJobRow | null) {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.originalFilename,
    fileType: doc.fileType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    failureCode: doc.failureCode,
    language: doc.language,
    pageCount: doc.pageCount,
    chunkCount: doc.chunkCount,
    createdAt: doc.createdAt.toISOString(),
    readyAt: doc.readyAt?.toISOString() ?? null,
    uploadedByUserId: doc.uploadedByUserId,
    processing: job && (doc.status === "queued" || doc.status === "processing") ? { step: job.step, progress: job.progress } : null,
  };
}
export type DocumentView = ReturnType<typeof documentView>;

export function conversationView(row: ConversationRow) {
  return {
    id: row.id,
    title: row.title,
    locale: row.locale,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
export type ConversationView = ReturnType<typeof conversationView>;

export function citationView(c: CitationRow) {
  return {
    label: c.label,
    ordinal: c.ordinal,
    chunkId: c.chunkId,
    documentId: c.documentId,
    documentTitle: c.documentTitle,
    pageNumber: c.pageNumber,
    sectionPath: c.sectionPath,
    excerpt: c.excerpt,
    sourceState: c.sourceState,
  };
}

export function messageView(message: MessageRow, citations: CitationRow[]) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    answerStatus: message.answerStatus,
    /** "sample" means the answer came from a deterministic test double, not from an AI model. */
    pipelineMode: message.pipelineMode,
    createdAt: message.createdAt.toISOString(),
    citations: citations.map(citationView),
  };
}
export type MessageView = ReturnType<typeof messageView>;
