import { getDocument, recordAudit, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireContext } from "@/server/context";
import { route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/**
 * The original file, streamed through the application after an authorization
 * check. Storage is never public and no storage URL is ever handed out.
 */
export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const { db, storage } = getServices();
  const doc = await withTenant(db, ctx.tenant.organizationId, async (tx) => {
    const found = await getDocument(tx, ctx.tenant, id);
    if (found && found.status !== "deleting") {
      await recordAudit(tx, {
        organizationId: ctx.tenant.organizationId, actorUserId: ctx.user.id, actorKind: "user",
        action: "document.downloaded", targetType: "document", targetId: id, outcome: "success", correlationId: requestId,
      });
    }
    return found;
  });
  if (!doc || doc.status === "deleting") throw new AppError("not_found");
  const bytes = await storage.get(doc.storageKey);

  // Only PDFs are shown inline (in a sandboxed frame); everything else downloads.
  const inline = doc.fileType === "pdf";
  const fallback = `document.${doc.fileType}`;
  const encoded = encodeURIComponent(doc.originalFilename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": doc.mimeType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, no-store",
      "x-request-id": requestId,
    },
  });
});
