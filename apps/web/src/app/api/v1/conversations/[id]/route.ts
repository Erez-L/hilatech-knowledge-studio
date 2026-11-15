import { deleteConversation, getConversation, listMessages, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";
import { conversationView, messageView } from "@/server/views";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const result = await withTenant(getServices().db, ctx.tenant.organizationId, async (tx) => {
    // Conversations belong to one user; a colleague in the same organization gets "not found".
    const conversation = await getConversation(tx, ctx.tenant, { userId: ctx.user.id }, id);
    return conversation ? { conversation, messages: await listMessages(tx, ctx.tenant, id) } : null;
  });
  if (!result) throw new AppError("not_found");
  return json(
    {
      conversation: conversationView(result.conversation),
      messages: result.messages.map(({ message, citations }) => messageView(message, citations)),
    },
    requestId,
  );
});

export const DELETE = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const deleted = await withTenant(getServices().db, ctx.tenant.organizationId, (tx) =>
    deleteConversation(tx, ctx.tenant, { userId: ctx.user.id }, uuidParam(params.id)),
  );
  if (!deleted) throw new AppError("not_found");
  return json({ deleted: true }, requestId);
});
