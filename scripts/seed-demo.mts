/**
 * Fills the public demo organization with the fictional Northstar documents.
 *
 *   pnpm demo:seed            (reads the same environment as the app)
 *
 * The files go through the real ingestion code (validate → extract → chunk →
 * embed → store) with whichever embeddings provider is configured, so the demo
 * index is built by the same model that will search it. Safe to run again:
 * files already indexed are skipped. The demo organization has no members;
 * nobody can upload to it or delete from it through the application.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createChatModel, createEmbeddingsProvider } from "../packages/ai/src/index.ts";
import { createStorage, ingestDocument, uploadDocument, type IngestionJobData, type Services } from "../packages/core/src/index.ts";
import { createDatabase, ensureDemoOrganization, listDocuments, sql, withTenant } from "../packages/database/src/index.ts";
import { getConfig } from "../packages/shared/src/index.ts";

/** Hebrew editions share file names with the English ones; they get Hebrew titles. */
const HEBREW_TITLES: Record<string, string> = {
  "customer-support-handbook": "מדריך תמיכת לקוחות",
  "refund-and-cancellation-policy": "נוהל החזרים וביטולים",
  "product-and-service-catalog": "קטלוג מוצרים ושירותים",
  "employee-onboarding-guide": "מדריך קליטת עובדים",
  "remote-work-policy": "נוהל עבודה מרחוק",
  "holiday-schedule-2027": "לוח חגים 2027",
};

const config = getConfig();
if (!config.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const embeddings = createEmbeddingsProvider(config);
if (!embeddings) throw new Error("No embeddings provider is configured (EMBEDDINGS_PROVIDER)");

const database = createDatabase(config.DATABASE_URL, { max: 3 });
const pending: IngestionJobData[] = [];
const services: Services = {
  config,
  db: database.db,
  storage: createStorage(config),
  queue: { enqueueIngestion: async (data) => void pending.push(data) }, // ingested below, in this process
  embeddings,
  chat: createChatModel(config),
};

const tenant = await ensureDemoOrganization(database.db);
const existing = await withTenant(database.db, tenant.organizationId, (tx) => listDocuments(tx, tenant));
const indexed = new Set(existing.filter((d) => d.status === "ready").map((d) => d.contentSha256));
const root = path.resolve(import.meta.dirname, "../samples/northstar");
let added = 0;
let failed = 0;

for (const edition of ["en", "he"] as const) {
  for (const name of (await readdir(path.join(root, edition))).sort()) {
    const bytes = new Uint8Array(await readFile(path.join(root, edition, name)));
    if (indexed.has(createHash("sha256").update(bytes).digest("hex"))) {
      console.log(`skip    ${edition}/${name} (already indexed)`);
      continue;
    }
    const document = await uploadDocument(services, tenant, { kind: "system" }, { filename: name, bytes, correlationId: `seed-demo-${edition}-${name}` });
    const title = edition === "he" ? HEBREW_TITLES[name.replace(/\.[a-z]+$/, "")] : undefined;
    if (title) {
      await withTenant(database.db, tenant.organizationId, (tx) =>
        tx.execute(sql`UPDATE documents SET title = ${title} WHERE id = ${document.id} AND organization_id = ${tenant.organizationId}`),
      );
    }
    const job = pending.pop()!;
    try {
      await ingestDocument(services, job, { attempt: 1, finalAttempt: true });
      added += 1;
      console.log(`indexed ${edition}/${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAILED  ${edition}/${name}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

const after = await withTenant(database.db, tenant.organizationId, (tx) => listDocuments(tx, tenant));
console.log(
  `demo organization ${tenant.organizationId}: ${after.filter((d) => d.status === "ready").length} documents ready, ${added} added, ${failed} failed. ` +
    `Embeddings: ${embeddings.descriptor.provider}/${embeddings.descriptor.modelId} (${embeddings.descriptor.kind}).`,
);
await database.close();
process.exit(failed ? 1 : 0);
