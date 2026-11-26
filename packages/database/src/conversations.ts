import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Executor, TenantContext } from "./client.ts";
import { citations, conversations, messages, type Locale, type RetrievalTrace } from "./schema.ts";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type CitationRow = typeof citations.$inferSelect;

/** Who owns a conversation: a signed-in user, or an anonymous demo session. */
export type Owner = { userId: string } | { demoSessionId: string };

const ownerFilter = (owner: Owner) =>
  "userId" in owner ? eq(conversations.userId, owner.userId) : eq(conversations.demoSessionId, owner.demoSessionId);

const scope = (ctx: TenantContext, owner: Owner) =>
  and(
    eq(conversations.organizationId, ctx.organizationId),
    eq(conversations.workspaceId, ctx.workspaceId),
    // Conversations are private to their owner, not shared across the organization.
    ownerFilter(owner),
  );

export async function createConversation(
  tx: Executor,
  ctx: TenantContext,
  owner: Owner,
  input: { title: string | null; locale: Locale },
): Promise<ConversationRow> {
  const [row] = await tx
    .insert(conversations)
    .values({
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      userId: "userId" in owner ? owner.userId : null,
      demoSessionId: "demoSessionId" in owner ? owner.demoSessionId : null,
      title: input.title,
      locale: input.locale,
    })
    .returning();
  if (!row) throw new Error("conversation insert returned no row");
  return row;
}

export async function getConversation(tx: Executor, ctx: TenantContext, owner: Owner, conversationId: string) {
  const [row] = await tx
    .select()
    .from(conversations)
    .where(and(scope(ctx, owner), eq(conversations.id, conversationId)))
    .limit(1);
  return row ?? null;
}

export async function listConversations(tx: Executor, ctx: TenantContext, owner: Owner, limit = 50) {
  return tx
    .select()
    .from(conversations)
    .where(scope(ctx, owner))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(Math.min(limit, 200));
}

export async function deleteConversation(tx: Executor, ctx: TenantContext, owner: Owner, conversationId: string) {
  const deleted = await tx
    .delete(conversations)
    .where(and(scope(ctx, owner), eq(conversations.id, conversationId)))
    .returning({ id: conversations.id });
  return deleted.length > 0;
}

export async function addUserMessage(
  tx: Executor,
  ctx: TenantContext,
  input: { conversationId: string; content: string; correlationId: string },
): Promise<MessageRow> {
  const [row] = await tx
    .insert(messages)
    .values({
      organizationId: ctx.organizationId,
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
      status: "complete",
      correlationId: input.correlationId,
    })
    .returning();
  if (!row) throw new Error("message insert returned no row");
  await tx
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversations.organizationId, ctx.organizationId), eq(conversations.id, input.conversationId)));
  return row;
}

export type NewCitation = {
  label: string;
  ordinal: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  sectionPath: string[] | null;
  excerpt: string;
  similarity: number;
};

export async function addAssistantMessage(
  tx: Executor,
  ctx: TenantContext,
  input: {
    conversationId: string;
    content: string;
    status: MessageRow["status"];
    answerStatus: MessageRow["answerStatus"];
    pipelineMode: "live" | "sample";
    llmProvider: string;
    llmModelId: string;
    embeddingIndexId: string;
    inputTokens: number | null;
    outputTokens: number | null;
    retrieval: RetrievalTrace;
    errorCode?: string | null;
    correlationId: string;
    citations: NewCitation[];
  },
): Promise<{ message: MessageRow; citations: CitationRow[] }> {
  const { citations: newCitations, ...values } = input;
  const [message] = await tx
    .insert(messages)
    .values({ ...values, organizationId: ctx.organizationId, role: "assistant" })
    .returning();
  if (!message) throw new Error("message insert returned no row");
  const saved = newCitations.length
    ? await tx
        .insert(citations)
        .values(newCitations.map((c) => ({ ...c, organizationId: ctx.organizationId, messageId: message.id })))
        .returning()
    : [];
  await tx
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversations.organizationId, ctx.organizationId), eq(conversations.id, input.conversationId)));
  return { message, citations: saved };
}

/**
 * The last `limit` messages of a conversation, oldest first, without citations: what a follow-up
 * question needs to know about the earlier turns. The caller has already checked that the
 * conversation belongs to the asker.
 */
export async function listRecentMessages(tx: Executor, ctx: TenantContext, conversationId: string, limit: number) {
  if (limit <= 0) return [];
  const rows = await tx
    .select({ role: messages.role, content: messages.content, status: messages.status, answerStatus: messages.answerStatus })
    .from(messages)
    .where(and(eq(messages.organizationId, ctx.organizationId), eq(messages.conversationId, conversationId)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(Math.min(limit, 50));
  return rows.reverse();
}

export async function listMessages(tx: Executor, ctx: TenantContext, conversationId: string) {
  const rows = await tx
    .select()
    .from(messages)
    .where(and(eq(messages.organizationId, ctx.organizationId), eq(messages.conversationId, conversationId)))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  const ids = rows.map((m) => m.id);
  const cites = ids.length
    ? await tx
        .select()
        .from(citations)
        .where(and(eq(citations.organizationId, ctx.organizationId), inArray(citations.messageId, ids)))
        .orderBy(asc(citations.ordinal))
    : [];
  return rows.map((message) => ({ message, citations: cites.filter((c) => c.messageId === message.id) }));
}
