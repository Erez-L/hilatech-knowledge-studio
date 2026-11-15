import { addMember, findUserByEmail, listMembers, recordAudit, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { z } from "zod";
import { requireCapability, requireContext } from "@/server/context";
import { json, route } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

export const GET = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "members.view");
  const members = await listMembers(getServices().db, ctx.tenant.organizationId);
  return json({ members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })) }, requestId);
});

const addSchema = z.object({ email: z.email().max(254), role: z.enum(["admin", "member"]) });

/** Adds an already-registered user to the caller's organization. (Email invitations are not implemented.) */
export const POST = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "members.manage");
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", "Enter a valid email address and a role");
  const { db } = getServices();
  const user = await findUserByEmail(db, parsed.data.email);
  // The same reply whether or not the address is registered, so this cannot be used to probe for accounts.
  if (user) {
    const added = await addMember(db, ctx.tenant.organizationId, user.id, parsed.data.role);
    if (added) {
      await withTenant(db, ctx.tenant.organizationId, (tx) =>
        recordAudit(tx, {
          organizationId: ctx.tenant.organizationId, actorUserId: ctx.user.id, actorKind: "user", action: "membership.added",
          targetType: "user", targetId: user.id, outcome: "success", metadata: { role: parsed.data.role }, correlationId: requestId,
        }),
      );
    }
  }
  return json({ accepted: true }, requestId, 202);
});
