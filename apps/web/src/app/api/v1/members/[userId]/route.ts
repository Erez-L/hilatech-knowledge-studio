import { changeMember, listMembers, recordAudit, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { z } from "zod";
import { requireCapability, requireContext, type RequestContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

const roleSchema = z.object({ role: z.enum(["owner", "admin", "member"]) });

async function guard(ctx: RequestContext, targetUserId: string, newRole?: string) {
  requireCapability(ctx, "members.manage");
  const members = await listMembers(getServices().db, ctx.tenant.organizationId);
  const target = members.find((m) => m.userId === targetUserId);
  if (!target) throw new AppError("not_found");
  // Only an owner may change an owner or grant ownership.
  if (ctx.role !== "owner" && (target.role === "owner" || newRole === "owner")) {
    throw new AppError("forbidden", "Only an owner can change owners");
  }
}

async function apply(ctx: RequestContext, userId: string, change: Parameters<typeof changeMember>[3], action: string, requestId: string) {
  const { db } = getServices();
  const result = await changeMember(db, ctx.tenant.organizationId, userId, change);
  if (result === "not_found") throw new AppError("not_found");
  if (result === "last_owner") throw new AppError("conflict", "An organization must keep at least one owner");
  await withTenant(db, ctx.tenant.organizationId, (tx) =>
    recordAudit(tx, {
      organizationId: ctx.tenant.organizationId, actorUserId: ctx.user.id, actorKind: "user", action,
      targetType: "user", targetId: userId, outcome: "success",
      metadata: "role" in change ? { role: change.role } : {}, correlationId: requestId,
    }),
  );
}

export const PATCH = route<{ userId: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const userId = uuidParam(params.userId);
  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", "Choose a role");
  await guard(ctx, userId, parsed.data.role);
  await apply(ctx, userId, { role: parsed.data.role }, "membership.role_changed", requestId);
  return json({ updated: true }, requestId);
});

export const DELETE = route<{ userId: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const userId = uuidParam(params.userId);
  await guard(ctx, userId);
  await apply(ctx, userId, { remove: true }, "membership.removed", requestId);
  return json({ removed: true }, requestId);
});
