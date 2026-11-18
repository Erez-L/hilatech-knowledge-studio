import { getProject, moveDocument, recordAudit, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { z } from "zod";
import { requireCapability, requireContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/** Moves a document from the active project to another project of the same organization. */
export const POST = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "documents.upload");
  const id = uuidParam(params.id);
  const parsed = z.object({ projectId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", "Choose a project");
  const org = ctx.tenant.organizationId;
  const outcome = await withTenant(getServices().db, org, async (tx) => {
    if (!(await getProject(tx, org, parsed.data.projectId))) return "not_found" as const;
    const result = await moveDocument(tx, ctx.tenant, id, parsed.data.projectId);
    if (result === "moved") {
      await recordAudit(tx, {
        organizationId: org, actorUserId: ctx.user.id, actorKind: "user", action: "document.moved", targetType: "document", targetId: id,
        outcome: "success", metadata: { from: ctx.tenant.workspaceId, to: parsed.data.projectId }, correlationId: requestId,
      });
    }
    return result;
  });
  if (outcome === "not_found") throw new AppError("not_found");
  if (outcome === "not_ready") throw new AppError("conflict", "Only a ready document can be moved");
  if (outcome === "duplicate") throw new AppError("duplicate_document", "That project already has this file");
  if (outcome === "same_project") throw new AppError("validation", "The document is already in that project");
  return json({ moved: true }, requestId);
});
