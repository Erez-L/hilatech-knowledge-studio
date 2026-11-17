/** Ingestion worker process: consumes the BullMQ queue and indexes uploaded documents. */
import { createChatModel, createEmbeddingsProvider, createPageReader } from "@hks/ai";
import { createIngestionWorker, createStorage } from "@hks/core";
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
log("info", "worker.started", { embeddings: embeddings.descriptor.provider, kind: embeddings.descriptor.kind, scannedPages: config.OCR_PROVIDER });

const shutdown = async () => {
  await worker.close();
  await database.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
