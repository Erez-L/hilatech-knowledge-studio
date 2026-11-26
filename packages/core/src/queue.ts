import { Queue, UnrecoverableError, Worker, type ConnectionOptions } from "bullmq";
import { listOrganizationIds, listStaleIngestions, withTenant } from "@hks/database";
import { isAppError, log } from "@hks/shared";
import { ingestDocument, isPermanentFailure, markIngestionFailed } from "./ingest.ts";
import type { IngestionJobData, JobQueue, Services } from "./services.ts";

export const INGESTION_QUEUE = "hks-ingestion";
const ATTEMPTS = 3;

export function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null, // required by BullMQ workers
  };
}

/** BullMQ-backed queue. Job payloads carry IDs only — never document content. */
export class BullJobQueue implements JobQueue {
  private readonly queue: Queue<IngestionJobData>;
  constructor(redisUrl: string, name = INGESTION_QUEUE) {
    this.queue = new Queue(name, { connection: redisConnection(redisUrl) });
  }
  async enqueueIngestion(data: IngestionJobData) {
    await this.queue.add("ingest-document", data, {
      jobId: data.jobId, // one queue job per ingestion job row
      attempts: ATTEMPTS,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });
  }
  /** The queue's state of one ingestion job, or null when the queue no longer holds it. */
  async jobState(jobId: string): Promise<string | null> {
    const job = await this.queue.getJob(jobId);
    return job ? job.getState() : null;
  }
  close() {
    return this.queue.close();
  }
}

export function createIngestionWorker(
  services: Omit<Services, "queue">,
  redisUrl: string,
  options: { name?: string; concurrency?: number } = {},
) {
  const worker = new Worker<IngestionJobData>(
    options.name ?? INGESTION_QUEUE,
    async (job) => {
      const attempt = job.attemptsMade + 1;
      try {
        await ingestDocument(services as Services, job.data, { attempt, finalAttempt: attempt >= (job.opts.attempts ?? 1) });
      } catch (error) {
        // A bad file will be just as bad next time: do not retry it.
        if (isPermanentFailure(error)) throw new UnrecoverableError((error as Error).message);
        throw error;
      }
    },
    { connection: redisConnection(redisUrl), concurrency: options.concurrency ?? services.config.WORKER_CONCURRENCY },
  );
  worker.on("error", (error) => log("error", "worker.error", { name: error.name }));
  // A job can end without the ingestion code recording why: it stalled (the worker died or ran
  // out of memory mid-job) more often than allowed, or failed outside ingestDocument. When it has
  // no attempts left, make sure the document does not stay "processing" for ever.
  worker.on("failed", (job, error) => {
    if (!job) return;
    const final = job.attemptsMade >= (job.opts.attempts ?? 1) || error instanceof UnrecoverableError || /stalled/i.test(error.message);
    log(final ? "warn" : "info", "worker.job_failed", { documentId: job.data.documentId, attempt: job.attemptsMade, final, name: error.name });
    if (!final) return;
    const ctx = { organizationId: job.data.organizationId, workspaceId: job.data.workspaceId };
    const code = isAppError(error) ? error.code : "internal";
    void markIngestionFailed(services, ctx, job.data, code, "Processing stopped before it finished. Try again.").catch((cause) =>
      log("error", "worker.mark_failed_error", { documentId: job.data.documentId, name: (cause as Error).name }),
    );
  });
  return worker;
}

/**
 * Finds documents that have been queued or processing for longer than INGESTION_STUCK_MINUTES
 * and whose job the queue no longer holds (lost with Redis, expired, or ended without a record),
 * and marks them failed so the user sees it and can retry. A job the queue still holds (waiting,
 * delayed or running) is left alone, however old. Safe to run from several workers at once.
 */
export async function sweepStuckDocuments(
  services: Pick<Services, "db" | "config">,
  queue: Pick<BullJobQueue, "jobState">,
  now = new Date(),
): Promise<number> {
  const before = new Date(now.getTime() - services.config.INGESTION_STUCK_MINUTES * 60_000);
  let marked = 0;
  for (const organizationId of await listOrganizationIds(services.db)) {
    const stale = await withTenant(services.db, organizationId, (tx) => listStaleIngestions(tx, organizationId, before));
    for (const item of stale) {
      const state = await queue.jobState(item.jobId);
      if (state && ["waiting", "delayed", "active", "prioritized", "waiting-children"].includes(state)) continue;
      await markIngestionFailed(services, { organizationId, workspaceId: item.workspaceId }, item, "internal", "Processing stopped before it finished. Try again.");
      log("warn", "ingestion.swept", { documentId: item.documentId, queueState: state ?? "missing" });
      marked++;
    }
  }
  return marked;
}

/** Runs the sweep now and then every `intervalMs`, until the returned stop function is called. */
export function startStuckDocumentSweep(services: Pick<Services, "db" | "config">, queue: Pick<BullJobQueue, "jobState">, intervalMs = 5 * 60_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await sweepStuckDocuments(services, queue);
    } catch (error) {
      log("error", "ingestion.sweep_failed", { name: (error as Error).name });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
