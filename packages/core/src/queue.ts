import { Queue, UnrecoverableError, Worker, type ConnectionOptions } from "bullmq";
import { log } from "@hks/shared";
import { ingestDocument, isPermanentFailure } from "./ingest.ts";
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
    { connection: redisConnection(redisUrl), concurrency: options.concurrency ?? 2 },
  );
  worker.on("error", (error) => log("error", "worker.error", { name: error.name }));
  return worker;
}
