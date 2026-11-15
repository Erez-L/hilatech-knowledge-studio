import { listConversations, withTenant } from "@hks/database";
import { requireContext } from "@/server/context";
import { json, route } from "@/server/http";
import { getServices } from "@/server/services";
import { conversationView } from "@/server/views";

export const runtime = "nodejs";

export const GET = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  const rows = await withTenant(getServices().db, ctx.tenant.organizationId, (tx) =>
    listConversations(tx, ctx.tenant, { userId: ctx.user.id }),
  );
  return json({ conversations: rows.map(conversationView) }, requestId);
});
