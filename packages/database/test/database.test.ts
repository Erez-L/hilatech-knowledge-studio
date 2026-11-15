import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addAssistantMessage,
  addUserMessage,
  beginDocumentDeletion,
  createConversation,
  createDocument,
  createOrganizationWithOwner,
  createUser,
  ensureActiveEmbeddingIndex,
  finishDocumentDeletion,
  getConversation,
  getDocument,
  insertContactLead,
  listConversations,
  listDocuments,
  listMemberships,
  listMessages,
  migrate,
  recordAudit,
  replaceChunks,
  schema,
  searchChunks,
  updateDocument,
  withTenant,
  type Database,
  type NewChunk,
  type TenantContext,
} from "../src/index.ts";
import { appDatabase, OWNER_URL, resetDatabase, vectorAlong } from "./helpers.ts";

/** Drizzle wraps driver errors; the database's own message is on `cause`. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  let message = "";
  try {
    await promise;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    message = `${(error as Error).message} | ${cause?.message ?? ""}`;
  }
  expect(message, "expected the statement to fail").toMatch(pattern);
}

let database: Database;
let a: TenantContext & { userId: string };
let b: TenantContext & { userId: string };
let indexId: string;

const chunk = (index: number, text: string, embedding: number[], page: number | null = 1): NewChunk => ({
  chunkIndex: index,
  pageNumber: page,
  pageEnd: null,
  sectionPath: null,
  text,
  searchText: text.toLowerCase(),
  tokenEstimate: Math.ceil(text.length / 4),
  chunkingVersion: "test",
  embedding,
});

async function tenant(name: string) {
  const user = await createUser(database.db, {
    email: `${name}-${randomUUID()}@example.test`,
    name,
    passwordHash: "not-a-real-hash",
    locale: "en",
  });
  const { organization, workspace } = await createOrganizationWithOwner(database.db, {
    name,
    slug: `${name}-${randomUUID().slice(0, 8)}`,
    ownerUserId: user!.id,
  });
  return { organizationId: organization.id, workspaceId: workspace.id, userId: user!.id };
}

async function readyDocument(ctx: TenantContext & { userId: string }, title: string, chunks: NewChunk[]) {
  return withTenant(database.db, ctx.organizationId, async (tx) => {
    const doc = await createDocument(tx, ctx, {
      uploadedByUserId: ctx.userId,
      title,
      originalFilename: `${title}.txt`,
      fileType: "txt",
      mimeType: "text/plain",
      sizeBytes: 100,
      storageKey: `org/${ctx.organizationId}/${randomUUID()}`,
      status: "processing",
    });
    await replaceChunks(tx, ctx, doc.id, indexId, chunks);
    await updateDocument(tx, ctx, doc.id, { status: "ready", chunkCount: chunks.length, readyAt: new Date() });
    return doc;
  });
}

beforeAll(async () => {
  await resetDatabase();
  database = appDatabase();
  a = await tenant("alpha");
  b = await tenant("beta");
  indexId = (
    await ensureActiveEmbeddingIndex(database.db, {
      provider: "deterministic",
      modelId: "test-double-v1",
      dimensions: 1024,
      kind: "test_double",
    })
  ).id;
});

afterAll(async () => {
  await database.close();
});

describe("migrations", () => {
  it("are idempotent", async () => {
    expect(await migrate(OWNER_URL)).toEqual([]);
  });

  it("match the typed schema column for column", async () => {
    const client = new pg.Client({ connectionString: OWNER_URL });
    await client.connect();
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    );
    await client.end();
    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
      actual.get(row.table_name)!.add(row.column_name);
    }
    for (const table of Object.values(schema)) {
      if (typeof table !== "object" || table === null || !("_" in (table as object))) continue;
      const config = getTableConfig(table as never);
      const expected = new Set(config.columns.map((c) => c.name));
      expect([...expected].sort(), `columns of ${config.name}`).toEqual([...(actual.get(config.name) ?? [])].sort());
    }
  });
});

describe("row-level security (application role)", () => {
  it("returns nothing when no tenant is set", async () => {
    await readyDocument(a, "rls-probe", [chunk(0, "alpha only", vectorAlong(900))]);
    const rows = await database.db.select().from(schema.documents);
    expect(rows).toEqual([]);
    const chunks = await database.db.select().from(schema.documentChunks);
    expect(chunks).toEqual([]);
    const vectors = await database.db.execute(sql`select count(*)::int as n from chunk_embeddings`);
    expect(vectors.rows[0]).toEqual({ n: 0 });
  });

  it("hides another tenant's rows even without an explicit filter", async () => {
    const seenByB = await withTenant(database.db, b.organizationId, (tx) => tx.select().from(schema.documents));
    expect(seenByB.every((d) => d.organizationId === b.organizationId)).toBe(true);
    expect(seenByB.some((d) => d.title === "rls-probe")).toBe(false);
  });

  it("refuses to write a row for another tenant", async () => {
    await expectDbError(withTenant(database.db, b.organizationId, (tx) =>
        createDocument(tx, a, {
          uploadedByUserId: null,
          title: "smuggled",
          originalFilename: "x.txt",
          fileType: "txt",
          mimeType: "text/plain",
          sizeBytes: 1,
          storageKey: "x",
          status: "uploaded",
        }),
      ), /row-level security/);
  });

  it("refuses writes when no tenant is set", async () => {
    await expectDbError(database.db.insert(schema.workspaces).values({ organizationId: a.organizationId, name: "x", slug: "x" }), /row-level security/);
  });

  it("cannot read leads back or rewrite the audit trail", async () => {
    await insertContactLead(database.db, {
      name: "Dana", email: "dana@example.test", company: null, message: "hi", locale: "en", requestId: "r1",
    });
    await expectDbError(database.db.execute(sql`select * from contact_leads`), /permission denied/);
    await withTenant(database.db, a.organizationId, (tx) =>
      recordAudit(tx, {
        organizationId: a.organizationId, actorUserId: a.userId, actorKind: "user",
        action: "document.deleted", outcome: "success", correlationId: "c1",
      }),
    );
    await expectDbError(database.db.execute(sql`update audit_events set action = 'x'`), /permission denied/);
    await expectDbError(database.db.execute(sql`delete from audit_events`), /permission denied/);
  });
});

describe("vector retrieval", () => {
  it("ranks by cosine similarity inside the caller's workspace only", async () => {
    // Tenant B holds vectors that are a PERFECT match for the query.
    await readyDocument(b, "beta-secrets", Array.from({ length: 40 }, (_, i) => chunk(i, `beta secret ${i}`, vectorAlong(7))));
    // Tenant A holds one close match and one far one.
    await readyDocument(a, "alpha-handbook", [
      chunk(0, "alpha near", vectorAlong(7, 8, 0.5), 3),
      chunk(1, "alpha far", vectorAlong(300), 9),
    ]);

    const results = await withTenant(database.db, a.organizationId, (tx) =>
      searchChunks(tx, a, { embeddingIndexId: indexId, queryVector: vectorAlong(7), topK: 5 }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.documentTitle.startsWith("alpha") || r.documentTitle === "rls-probe")).toBe(true);
    expect(results[0]!.text).toBe("alpha near");
    expect(results[0]!.pageNumber).toBe(3);
    expect(results[0]!.similarity).toBeGreaterThan(0.85);
    expect(results[0]!.similarity).toBeLessThan(1);
    expect(results.find((r) => r.text === "alpha far")!.similarity).toBeLessThan(0.1);

    const forB = await withTenant(database.db, b.organizationId, (tx) =>
      searchChunks(tx, b, { embeddingIndexId: indexId, queryVector: vectorAlong(7), topK: 5 }),
    );
    expect(forB).toHaveLength(5);
    expect(forB.every((r) => r.documentTitle === "beta-secrets")).toBe(true);
  });

  it("returns nothing when a tenant context is paired with another tenant's ids", async () => {
    // Session bound to B, but the query asks for A's workspace: RLS still blocks it.
    const results = await withTenant(database.db, b.organizationId, (tx) =>
      searchChunks(tx, a, { embeddingIndexId: indexId, queryVector: vectorAlong(7), topK: 5 }),
    );
    expect(results).toEqual([]);
  });

  it("excludes documents that are not ready", async () => {
    const doc = await readyDocument(a, "alpha-draft", [chunk(0, "draft text", vectorAlong(55))]);
    await withTenant(database.db, a.organizationId, (tx) => updateDocument(tx, a, doc.id, { status: "failed" }));
    const results = await withTenant(database.db, a.organizationId, (tx) =>
      searchChunks(tx, a, { embeddingIndexId: indexId, queryVector: vectorAlong(55), topK: 3 }),
    );
    expect(results.some((r) => r.text === "draft text")).toBe(false);
  });

  it("rejects vectors of the wrong dimension", async () => {
    await expectDbError(readyDocument(a, "bad-dims", [chunk(0, "x", [0.1, 0.2, 0.3])]), /expected 1024 dimensions/);
  });

  it("never serves one model's index to another model", async () => {
    await expectDbError(ensureActiveEmbeddingIndex(database.db, { provider: "deterministic", modelId: "other-model", dimensions: 1024, kind: "test_double" }), /reindex is required/);
    await expectDbError(ensureActiveEmbeddingIndex(database.db, { provider: "x", modelId: "y", dimensions: 1536, kind: "live" }), /1024/);
    // A live index is separate from the test-double index, so their vectors are never compared.
    const live = await ensureActiveEmbeddingIndex(database.db, {
      provider: "bedrock-cohere", modelId: "configured-live-model", dimensions: 1024, kind: "live",
    });
    expect(live.id).not.toBe(indexId);
    const fromLive = await withTenant(database.db, a.organizationId, (tx) =>
      searchChunks(tx, a, { embeddingIndexId: live.id, queryVector: vectorAlong(7), topK: 5 }),
    );
    expect(fromLive).toEqual([]);
  });
});

describe("documents", () => {
  it("lists and searches within the workspace, matching wildcards literally", async () => {
    const all = await withTenant(database.db, a.organizationId, (tx) => listDocuments(tx, a));
    expect(all.map((d) => d.title)).toContain("alpha-handbook");
    const found = await withTenant(database.db, a.organizationId, (tx) => listDocuments(tx, a, { search: "HANDBOOK" }));
    expect(found.map((d) => d.title)).toEqual(["alpha-handbook"]);
    const wildcard = await withTenant(database.db, a.organizationId, (tx) => listDocuments(tx, a, { search: "%" }));
    expect(wildcard).toEqual([]);
  });

  it("blocks a second ready document with identical content", async () => {
    const make = (title: string) =>
      withTenant(database.db, a.organizationId, async (tx) => {
        const doc = await createDocument(tx, a, {
          uploadedByUserId: a.userId, title, originalFilename: `${title}.txt`, fileType: "txt",
          mimeType: "text/plain", sizeBytes: 5, storageKey: randomUUID(), status: "uploaded",
        });
        await updateDocument(tx, a, doc.id, { status: "processing", contentSha256: "same-hash" });
      });
    await make("first-copy");
    await expectDbError(make("second-copy"), /documents_no_duplicates/);
  });

  it("deletes in two steps: unretrievable at once, then citations tombstoned", async () => {
    const doc = await readyDocument(a, "alpha-to-delete", [chunk(0, "delete me", vectorAlong(444), 2)]);
    const hit = await withTenant(database.db, a.organizationId, (tx) =>
      searchChunks(tx, a, { embeddingIndexId: indexId, queryVector: vectorAlong(444), topK: 1 }),
    );
    expect(hit[0]!.text).toBe("delete me");

    // A conversation that cites the document.
    const owner = { userId: a.userId };
    const messageId = await withTenant(database.db, a.organizationId, async (tx) => {
      const conversation = await createConversation(tx, a, owner, { title: "t", locale: "en" });
      await addUserMessage(tx, a, { conversationId: conversation.id, content: "q", correlationId: "c" });
      const saved = await addAssistantMessage(tx, a, {
        conversationId: conversation.id, content: "answer [S1]", status: "complete", answerStatus: "answered",
        pipelineMode: "sample", llmProvider: "deterministic", llmModelId: "test-double-v1", embeddingIndexId: indexId,
        inputTokens: 1, outputTokens: 1, correlationId: "c",
        retrieval: { topK: 1, minSimilarity: 0, evidenceMinSimilarity: 0, candidates: [] },
        citations: [{
          label: "S1", ordinal: 1, chunkId: hit[0]!.chunkId, documentId: doc.id, documentTitle: "alpha-to-delete",
          pageNumber: 2, sectionPath: null, excerpt: "delete me", similarity: 1,
        }],
      });
      return { conversationId: conversation.id, messageId: saved.message.id };
    });

    await withTenant(database.db, a.organizationId, (tx) => beginDocumentDeletion(tx, a, doc.id));
    const afterBegin = await withTenant(database.db, a.organizationId, (tx) =>
      searchChunks(tx, a, { embeddingIndexId: indexId, queryVector: vectorAlong(444), topK: 3 }),
    );
    expect(afterBegin.some((r) => r.documentId === doc.id)).toBe(false);
    const listed = await withTenant(database.db, a.organizationId, (tx) => listDocuments(tx, a));
    expect(listed.some((d) => d.id === doc.id)).toBe(false);

    const storageKey = await withTenant(database.db, a.organizationId, (tx) => finishDocumentDeletion(tx, a, doc.id));
    expect(storageKey).toBe(doc.storageKey);
    expect(await withTenant(database.db, a.organizationId, (tx) => getDocument(tx, a, doc.id))).toBeNull();
    const remaining = await withTenant(database.db, a.organizationId, (tx) =>
      tx.execute(sql`select count(*)::int as n from document_chunks where document_id = ${doc.id}::uuid`),
    );
    expect(remaining.rows[0]).toEqual({ n: 0 });

    const thread = await withTenant(database.db, a.organizationId, (tx) => listMessages(tx, a, messageId.conversationId));
    const citation = thread.find((m) => m.message.id === messageId.messageId)!.citations[0]!;
    expect(citation).toMatchObject({
      sourceState: "removed", excerpt: null, pageNumber: null, chunkId: null, documentId: null,
      documentTitle: "alpha-to-delete",
    });
  });
});

describe("conversations", () => {
  it("are private to their owner, even inside one organization", async () => {
    const colleague = await createUser(database.db, {
      email: `colleague-${randomUUID()}@example.test`, name: "c", passwordHash: "x", locale: "en",
    });
    await database.db.insert(schema.memberships).values({ organizationId: a.organizationId, userId: colleague!.id, role: "member" });

    const mine = await withTenant(database.db, a.organizationId, (tx) =>
      createConversation(tx, a, { userId: a.userId }, { title: "mine", locale: "he" }),
    );
    const asColleague = await withTenant(database.db, a.organizationId, (tx) =>
      getConversation(tx, a, { userId: colleague!.id }, mine.id),
    );
    expect(asColleague).toBeNull();
    const theirList = await withTenant(database.db, a.organizationId, (tx) => listConversations(tx, a, { userId: colleague!.id }));
    expect(theirList).toEqual([]);
    const asOwner = await withTenant(database.db, a.organizationId, (tx) => getConversation(tx, a, { userId: a.userId }, mine.id));
    expect(asOwner?.title).toBe("mine");
  });

  it("must have exactly one kind of owner", async () => {
    await expectDbError(withTenant(database.db, a.organizationId, (tx) =>
        tx.insert(schema.conversations).values({ organizationId: a.organizationId, workspaceId: a.workspaceId, locale: "en" }),
      ), /check constraint/);
  });
});

describe("memberships", () => {
  it("lists a user's organizations with their default workspace", async () => {
    const list = await listMemberships(database.db, a.userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ organizationId: a.organizationId, workspaceId: a.workspaceId, role: "owner" });
  });
});
