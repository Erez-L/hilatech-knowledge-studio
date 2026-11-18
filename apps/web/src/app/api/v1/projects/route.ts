import { createProject, listProjects, recordAudit, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { z } from "zod";
import { requireCapability, requireContext } from "@/server/context";
import { enforceRateLimit, json, route } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/** The caller's projects. Every member may see and work in all of them. */
export const GET = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  const projects = await withTenant(getServices().db, ctx.tenant.organizationId, (tx) => listProjects(tx, ctx.tenant.organizationId));
  return json(
    { activeProjectId: ctx.project.id, projects: projects.map((p) => ({ id: p.id, name: p.name, documentCount: p.documentCount, isDefault: p.isDefault })) },
    requestId,
  );
});

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const POST = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "projects.manage");
  const parsed = nameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", "Enter a project name of up to 120 characters");
  await enforceRateLimit("project-create", ctx.user.id, 20, 3600);
  const { db } = getServices();
  const created = await withTenant(db, ctx.tenant.organizationId, async (tx) => {
    const project = await createProject(tx, ctx.tenant.organizationId, parsed.data.name);
    if (!project) return null;
    await recordAudit(tx, {
      organizationId: ctx.tenant.organizationId, actorUserId: ctx.user.id, actorKind: "user", action: "project.created",
      targetType: "workspace", targetId: project.id, outcome: "success", correlationId: requestId,
    });
    return project;
  });
  if (!created) throw new AppError("conflict", "The organization has reached the maximum number of projects");
  return json({ project: { id: created.id, name: created.name, documentCount: 0, isDefault: false } }, requestId, 201);
});
