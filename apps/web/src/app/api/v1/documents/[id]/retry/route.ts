import { retryIngestion } from "@hks/core";
import { requireCapability, requireContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

export const POST = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "documents.upload");
  await retryIngestion(getServices(), ctx.tenant, uuidParam(params.id), requestId);
  return json({ queued: true }, requestId, 202);
});
