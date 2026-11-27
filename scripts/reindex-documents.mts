/**
 * Queues Ready documents to be indexed again with the current extraction and chunking rules,
 * for example after an upgrade that spaces Hebrew PDF text correctly or sizes chunks differently.
 *
 *   pnpm reindex                              list what would be queued (nothing is changed)
 *   pnpm reindex --apply                      queue every Ready document indexed with older rules
 *   pnpm reindex --apply --organization <id>  only that organization
 *   pnpm reindex --apply --document <id>      only that document (with --organization)
 *   pnpm reindex --apply --all                also documents already on the current rules
 *
 * Reads the same environment as the worker (DATABASE_URL, REDIS_URL, the embeddings settings).
 * The worker does the work: run this where it can reach the same Redis, with the worker running.
 * Each document costs embedding tokens like a new upload and is reserved against its
 * organization's daily AI budget; a document the budget does not cover fails its job and stays
 * Ready with its earlier passages. Saved summaries of a re-indexed document are removed, since
 * they point at the old passages. Old conversations keep their stored citation excerpts.
 */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { chunkingVersion, createEmbeddingsProvider } from "../packages/ai/src/index.ts";
import { BullJobQueue, reindexDocument, type Services } from "../packages/core/src/index.ts";
import { createDatabase, sql, withTenant } from "../packages/database/src/index.ts";
import { getConfig } from "../packages/shared/src/index.ts";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    organization: { type: "string" },
    document: { type: "string" },
  },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (values.organization && !uuid.test(values.organization)) throw new Error("--organization must be a UUID");
if (values.document && (!uuid.test(values.document) || !values.organization)) throw new Error("--document needs a UUID and --organization");

const config = getConfig();
if (!config.DATABASE_URL || !config.REDIS_URL) throw new Error("DATABASE_URL and REDIS_URL must be set");
const embeddings = createEmbeddingsProvider(config);
if (!embeddings) throw new Error("No embeddings provider is configured (EMBEDDINGS_PROVIDER)");

// The rules a document indexed today gets, in the same form the ingestion code stores them.
const maxChars = Math.min(config.CHUNK_MAX_CHARS, embeddings.maxCharsPerText);
const targetChars = Math.min(config.CHUNK_TARGET_CHARS, maxChars);
const current = chunkingVersion({
  targetChars,
  maxChars,
  overlapChars: Math.min(config.CHUNK_OVERLAP_CHARS, maxChars - targetChars),
  tokens: embeddings.estimateTokens && embeddings.maxTokensPerText ? { max: embeddings.maxTokensPerText, estimate: embeddings.estimateTokens } : undefined,
});

const database = createDatabase(config.DATABASE_URL, { max: 2 });
const queue = values.apply ? new BullJobQueue(config.REDIS_URL) : null;
const services = { config, db: database.db, queue, embeddings } as unknown as Services;
let queued = 0;
let skipped = 0;
try {
  // Organizations are not tenant rows; their documents are read inside each tenant's own scope.
  const organizations = values.organization
    ? [values.organization]
    : (await database.db.execute(sql`select id from organizations order by created_at, id`)).rows.map((row) => String(row.id));
  for (const organizationId of organizations) {
    const documents = await withTenant(database.db, organizationId, async (tx) =>
      (await tx.execute(sql`
        select d.id, d.workspace_id, min(c.chunking_version) as oldest, max(c.chunking_version) as newest
        from documents d left join document_chunks c on c.document_id = d.id and c.organization_id = d.organization_id
        where d.organization_id = ${organizationId}::uuid and d.status = 'ready'
          ${values.document ? sql`and d.id = ${values.document}::uuid` : sql``}
        group by d.id, d.workspace_id order by d.id`)).rows,
    );
    for (const row of documents) {
      const upToDate = row.oldest === current && row.newest === current;
      if (upToDate && !values.all) {
        skipped++;
        continue;
      }
      const ctx = { organizationId, workspaceId: String(row.workspace_id) };
      if (queue) await reindexDocument({ ...services, queue }, ctx, String(row.id), `reindex-${randomUUID()}`);
      queued++;
      console.log(`${values.apply ? "queued " : "would queue"} ${organizationId} ${row.id} (${row.oldest ?? "no passages"} -> ${current})`);
    }
  }
  console.log(`${values.apply ? "Queued" : "Would queue"} ${queued} document(s); ${skipped} already on ${current}.${values.apply ? "" : " Add --apply to queue them."}`);
} finally {
  await queue?.close();
  await database.close();
}
