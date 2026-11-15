import { getConversation, listMessages, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireDemoContext } from "@/server/demo";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";
import { conversationView, messageView } from "@/server/views";

export const runtime = "nodejs";

/** A demo conversation, readable only by the anonymous session that started it. */
export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireDemoContext(request);
  const id = uuidParam(params.id);
  const result = await withTenant(getServices().db, ctx.tenant.organizationId, async (tx) => {
    const conversation = await getConversation(tx, ctx.tenant, { demoSessionId: ctx.demoSessionId }, id);
    return conversation ? { conversation, messages: await listMessages(tx, ctx.tenant, id) } : null;
  });
  if (!result) throw new AppError("not_found");
  return json({ conversation: conversationView(result.conversation), messages: result.messages.map(({ message, citations }) => messageView(message, citations)) }, requestId);
});
