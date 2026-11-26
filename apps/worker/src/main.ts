/** Ingestion worker process: consumes the BullMQ queue and indexes uploaded documents. */
import { createChatModel, createEmbeddingsProvider, createPageReader } from "@hks/ai";
import os from "node:os";
import path from "node:path";
import { BullJobQueue, createIngestionWorker, createRedis, createStorage, startHeartbeat, startStuckDocumentSweep } from "@hks/core";
import { createDatabase } from "@hks/database";
import { getConfig, log } from "@hks/shared";

const config = getConfig();
if (!config.DATABASE_URL || !config.REDIS_URL) {
  log("error", "worker.not_configured", { missing: !config.DATABASE_URL ? "DATABASE_URL" : "REDIS_URL" });
  process.exit(1);
}
const embeddings = createEmbeddingsProvider(config);
if (!embeddings) {
  log("error", "worker.not_configured", { missing: "EMBEDDINGS_PROVIDER" });
  process.exit(1);
}

const database = createDatabase(config.DATABASE_URL, { max: 5 });
const worker = createIngestionWorker(
  { config, db: database.db, storage: createStorage(config), embeddings, chat: createChatModel(config), pageReader: createPageReader(config) },
  config.REDIS_URL,
);
log("info", "worker.started", {
  embeddings: embeddings.descriptor.provider, kind: embeddings.descriptor.kind, scannedPages: config.OCR_PROVIDER, concurrency: config.WORKER_CONCURRENCY,
});

// Documents left queued or processing with no job behind them are marked failed, so they can be retried.
const sweepQueue = new BullJobQueue(config.REDIS_URL);
const stopSweep = startStuckDocumentSweep({ config, db: database.db }, sweepQueue);

// Alive means: the queue consumer is running and Redis answers. The probe has a connection of
// its own, because the queue library keeps its connection to itself.
const probe = createRedis(config.REDIS_URL);
probe.on("error", () => {}); // a lost connection shows as a missed heartbeat
const heartbeat = startHeartbeat({
  file: config.WORKER_HEARTBEAT_FILE ?? path.join(os.tmpdir(), "hks-worker-heartbeat"),
  alive: async () => worker.isRunning() && (await probe.ping()) === "PONG",
});

const shutdown = async () => {
  heartbeat.stop();
  stopSweep();
  probe.disconnect();
  await worker.close();
  await sweepQueue.close();
  await database.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
