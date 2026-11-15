import { deleteDocument } from "@hks/core";
import { getDocument, latestIngestionJob, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { can, requireContext } from "@/server/context";
import { auditDenied, json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";
import { documentView } from "@/server/views";

export const runtime = "nodejs";

export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const result = await withTenant(getServices().db, ctx.tenant.organizationId, async (tx) => {
    const doc = await getDocument(tx, ctx.tenant, id);
    return doc ? { doc, job: await latestIngestionJob(tx, ctx.tenant, id) } : null;
  });
  // Another organization's document is indistinguishable from a missing one.
  if (!result || result.doc.status === "deleting") throw new AppError("not_found");
  return json({ document: documentView(result.doc, result.job) }, requestId);
});

export const DELETE = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const services = getServices();
  const doc = await withTenant(services.db, ctx.tenant.organizationId, (tx) => getDocument(tx, ctx.tenant, id));
  if (!doc) throw new AppError("not_found");
  // Members may delete what they uploaded; admins and owners may delete anything.
  if (!can(ctx, "documents.delete_any") && doc.uploadedByUserId !== ctx.user.id) {
    await auditDenied("document.delete", { organizationId: ctx.tenant.organizationId, userId: ctx.user.id }, requestId);
    throw new AppError("forbidden", "Only the uploader or an admin can delete this document");
  }
  await deleteDocument(services, ctx.tenant, { kind: "user", userId: ctx.user.id }, id, requestId);
  return json({ deleted: true }, requestId);
});
