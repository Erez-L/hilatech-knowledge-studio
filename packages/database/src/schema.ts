/**
 * Typed table definitions. The SQL in ../migrations is the source of truth for
 * constraints, indexes and row-level security; `test/schema-parity.test.ts`
 * fails if a column here does not exist in the migrated database or vice versa.
 */
import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const EMBEDDING_DIMENSIONS = 1024;

export type DocumentStatus =
  | "pending_upload"
  | "uploaded"
  | "queued"
  | "processing"
  | "ready"
  | "failed"
  | "unsupported"
  | "deleting";
export type FileType = "pdf" | "docx" | "txt" | "md";
export type Locale = "he" | "en";

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  kind: text("kind").$type<"standard" | "demo">().notNull().default("standard"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * users, sessions, accounts and verifications are read and written by Better
 * Auth. Property names follow its field names; do not rename them.
 */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifiedAt: ts("email_verified_at"),
  name: text("name"),
  image: text("image"),
  /** Unused since Better Auth: credentials live in `accounts`. */
  passwordHash: text("password_hash"),
  locale: text("locale").$type<Locale>().notNull().default("en"),
  disabledAt: ts("disabled_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull(),
  token: text("token"),
  /** Unused since Better Auth. */
  tokenHash: text("token_hash"),
  expiresAt: ts("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: id(),
  userId: uuid("user_id").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verifications = pgTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable("memberships", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").$type<"owner" | "admin" | "member">().notNull(),
  createdAt: createdAt(),
});

export const workspaces = pgTable("workspaces", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const documents = pgTable("documents", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  uploadedByUserId: uuid("uploaded_by_user_id"),
  title: text("title").notNull(),
  originalFilename: text("original_filename").notNull(),
  fileType: text("file_type").$type<FileType>().notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  contentSha256: text("content_sha256"),
  storageKey: text("storage_key").notNull(),
  language: text("language").$type<"he" | "en" | "mixed">(),
  pageCount: integer("page_count"),
  chunkCount: integer("chunk_count").notNull().default(0),
  status: text("status").$type<DocumentStatus>().notNull(),
  failureCode: text("failure_code"),
  failureDetail: text("failure_detail"),
  readyAt: ts("ready_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const documentChunks = pgTable("document_chunks", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  documentId: uuid("document_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  pageNumber: integer("page_number"),
  pageEnd: integer("page_end"),
  sectionPath: text("section_path").array(),
  text: text("text").notNull(),
  searchText: text("search_text").notNull(),
  fts: tsvector("fts").generatedAlwaysAs(() => "to_tsvector('simple', search_text)" as never),
  charCount: integer("char_count").notNull(),
  tokenEstimate: integer("token_estimate").notNull(),
  chunkingVersion: text("chunking_version").notNull(),
  createdAt: createdAt(),
});

export const embeddingIndexes = pgTable("embedding_indexes", {
  id: id(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  kind: text("kind").$type<"live" | "test_double">().notNull(),
  dimensions: integer("dimensions").notNull(),
  distance: text("distance").notNull().default("cosine"),
  storageTable: text("storage_table").notNull().default("chunk_embeddings"),
  status: text("status").$type<"building" | "active" | "retired">().notNull(),
  createdAt: createdAt(),
  activatedAt: ts("activated_at"),
  retiredAt: ts("retired_at"),
});

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    chunkId: uuid("chunk_id").notNull(),
    embeddingIndexId: uuid("embedding_index_id").notNull(),
    dimensions: integer("dimensions").notNull().default(EMBEDDING_DIMENSIONS),
    organizationId: uuid("organization_id").notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    documentId: uuid("document_id").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.chunkId, t.embeddingIndexId] })],
);

export const ingestionJobs = pgTable("ingestion_jobs", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  documentId: uuid("document_id").notNull(),
  kind: text("kind").$type<"ingest" | "reindex">().notNull().default("ingest"),
  status: text("status").$type<"queued" | "running" | "succeeded" | "failed" | "cancelled">().notNull(),
  step: text("step").$type<"validating" | "extracting" | "normalizing" | "chunking" | "embedding" | "persisting">(),
  progress: smallint("progress").notNull().default(0),
  attempt: integer("attempt").notNull().default(0),
  errorCode: text("error_code"),
  errorDetail: text("error_detail"),
  embeddingIndexId: uuid("embedding_index_id"),
  correlationId: text("correlation_id").notNull(),
  queuedAt: ts("queued_at").notNull().defaultNow(),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
});

export const conversations = pgTable("conversations", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: uuid("user_id"),
  demoSessionId: text("demo_session_id"),
  title: text("title"),
  locale: text("locale").$type<Locale>().notNull(),
  lastMessageAt: ts("last_message_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type RetrievalTrace = {
  topK: number;
  minSimilarity: number;
  evidenceMinSimilarity: number;
  candidates: { chunkId: string; label: string | null; similarity: number }[];
};

export const messages = pgTable("messages", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  status: text("status").$type<"complete" | "streaming" | "cancelled" | "failed">().notNull(),
  answerStatus: text("answer_status").$type<"answered" | "insufficient_evidence" | "uncited">(),
  pipelineMode: text("pipeline_mode").$type<"live" | "sample">(),
  llmProvider: text("llm_provider"),
  llmModelId: text("llm_model_id"),
  embeddingIndexId: uuid("embedding_index_id"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  retrieval: jsonb("retrieval").$type<RetrievalTrace>(),
  errorCode: text("error_code"),
  correlationId: text("correlation_id").notNull(),
  createdAt: createdAt(),
});

export const citations = pgTable("citations", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  messageId: uuid("message_id").notNull(),
  label: text("label").notNull(),
  ordinal: integer("ordinal").notNull(),
  chunkId: uuid("chunk_id"),
  documentId: uuid("document_id"),
  documentTitle: text("document_title"),
  pageNumber: integer("page_number"),
  sectionPath: text("section_path").array(),
  excerpt: text("excerpt"),
  similarity: real("similarity"),
  sourceState: text("source_state").$type<"available" | "removed">().notNull().default("available"),
  createdAt: createdAt(),
});

export const aiBudgetDays = pgTable(
  "ai_budget_days",
  {
    organizationId: uuid("organization_id").notNull(),
    day: date("day").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.day] })],
);

export const usageEvents = pgTable("usage_events", {
  id: id(),
  organizationId: uuid("organization_id").notNull(),
  workspaceId: uuid("workspace_id"),
  userId: uuid("user_id"),
  demoSessionId: text("demo_session_id"),
  kind: text("kind").$type<"chat_completion" | "query_embedding" | "document_embedding" | "document_ocr">().notNull(),
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  providerKind: text("provider_kind").$type<"live" | "test_double">().notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  units: integer("units").notNull().default(0),
  messageId: uuid("message_id"),
  documentId: uuid("document_id"),
  correlationId: text("correlation_id").notNull(),
  createdAt: createdAt(),
});

export const contactLeads = pgTable("contact_leads", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  message: text("message"),
  locale: text("locale").notNull(),
  source: text("source").notNull().default("landing"),
  requestId: text("request_id"),
  status: text("status").notNull().default("new"),
  createdAt: createdAt(),
});

export const auditEvents = pgTable("audit_events", {
  id: id(),
  organizationId: uuid("organization_id"),
  actorUserId: uuid("actor_user_id"),
  actorKind: text("actor_kind").$type<"user" | "demo" | "system" | "anonymous">().notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: uuid("target_id"),
  outcome: text("outcome").$type<"success" | "denied" | "failure">().notNull(),
  metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  correlationId: text("correlation_id").notNull(),
  createdAt: createdAt(),
});
