import { and, eq, gte, sql } from "drizzle-orm";
import type { Executor } from "./client.ts";
import { auditEvents, contactLeads, usageEvents } from "./schema.ts";

export type NewUsageEvent = Omit<typeof usageEvents.$inferInsert, "id" | "createdAt">;

export async function recordUsage(tx: Executor, event: NewUsageEvent) {
  await tx.insert(usageEvents).values(event);
}

/** Token and request totals for an organization since `since`. Test doubles are excluded from spend. */
export async function usageSince(tx: Executor, organizationId: string, since: Date) {
  const [row] = await tx
    .select({
      inputTokens: sql<string>`coalesce(sum(${usageEvents.inputTokens}) filter (where ${usageEvents.providerKind} = 'live'), 0)`,
      outputTokens: sql<string>`coalesce(sum(${usageEvents.outputTokens}) filter (where ${usageEvents.providerKind} = 'live'), 0)`,
      questions: sql<string>`count(*) filter (where ${usageEvents.kind} = 'chat_completion')`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.organizationId, organizationId), gte(usageEvents.createdAt, since)));
  return {
    inputTokens: Number(row?.inputTokens ?? 0),
    outputTokens: Number(row?.outputTokens ?? 0),
    questions: Number(row?.questions ?? 0),
  };
}

export type NewAuditEvent = Omit<typeof auditEvents.$inferInsert, "id" | "createdAt">;

/** Append-only. Metadata carries IDs and codes only. */
export async function recordAudit(tx: Executor, event: NewAuditEvent) {
  await tx.insert(auditEvents).values(event);
}

export async function insertContactLead(
  tx: Executor,
  lead: { name: string; email: string; company: string | null; message: string | null; locale: string; requestId: string },
) {
  await tx.insert(contactLeads).values(lead);
}
