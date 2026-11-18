import { deleteEmptyProject, recordAudit, renameProject, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { z } from "zod";
import { requireCapability, requireContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const PATCH = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "projects.manage");
  const id = uuidParam(params.id);
  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", "Enter a project name of up to 120 characters");
  const updated = await withTenant(getServices().db, ctx.tenant.organizationId, (tx) => renameProject(tx, ctx.tenant.organizationId, id, parsed.data.name));
  if (!updated) throw new AppError("not_found");
  return json({ project: { id: updated.id, name: updated.name } }, requestId);
});

/** Only an empty project can be deleted; its documents are deleted one by one first, which also removes their files. */
export const DELETE = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "projects.manage");
  const id = uuidParam(params.id);
  const outcome = await withTenant(getServices().db, ctx.tenant.organizationId, async (tx) => {
    const result = await deleteEmptyProject(tx, ctx.tenant.organizationId, id);
    if (result === "deleted") {
      await recordAudit(tx, {
        organizationId: ctx.tenant.organizationId, actorUserId: ctx.user.id, actorKind: "user", action: "project.deleted",
        targetType: "workspace", targetId: id, outcome: "success", correlationId: requestId,
      });
    }
    return result;
  });
  if (outcome === "not_found") throw new AppError("not_found");
  if (outcome === "is_default") throw new AppError("conflict", "The first project cannot be deleted");
  if (outcome === "not_empty") throw new AppError("conflict", "Delete the project's documents first");
  return json({ deleted: true }, requestId);
});
