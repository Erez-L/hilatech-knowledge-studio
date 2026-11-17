import type { ChatModelProvider, EmbeddingsProvider, PageTextReader } from "@hks/ai";
import type { Db } from "@hks/database";
import type { Config } from "@hks/shared";
import type { ObjectStorage } from "./storage.ts";

export type IngestionJobData = {
  organizationId: string;
  workspaceId: string;
  documentId: string;
  jobId: string;
  correlationId: string;
};

export interface JobQueue {
  enqueueIngestion(data: IngestionJobData): Promise<void>;
}

/** Everything the use cases need, passed explicitly so tests can substitute any part. */
export type Services = {
  config: Config;
  db: Db;
  storage: ObjectStorage;
  queue: JobQueue;
  /** null when not configured: features that need it report that, they never fake output. */
  embeddings: EmbeddingsProvider | null;
  chat: ChatModelProvider | null;
  /** Reads scanned PDF pages. Absent or null: scanned PDFs are reported as unsupported. */
  pageReader?: PageTextReader | null;
};

/** Who is acting, for audit records. */
export type Actor = { kind: "user"; userId: string } | { kind: "demo"; demoSessionId: string } | { kind: "system" };
export const actorFields = (actor: Actor) => ({
  actorKind: actor.kind,
  actorUserId: actor.kind === "user" ? actor.userId : null,
});
