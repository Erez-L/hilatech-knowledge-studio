import { renderPdfPage } from "@hks/ai";
import { getDocument, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireDemoContext } from "@/server/demo";
import { enforceRateLimit, rateKeyFor, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/** A page image of a DEMO PDF. Rendering costs CPU, so it is rate-limited per client address. */
export const GET = route<{ id: string; page: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireDemoContext(request);
  const id = uuidParam(params.id);
  const page = Number(params.page);
  if (!Number.isInteger(page) || page < 1) throw new AppError("not_found");
  await enforceRateLimit("demo-page-render", rateKeyFor(request), 40, 60);
  const { db, storage } = getServices();
  const doc = await withTenant(db, ctx.tenant.organizationId, (tx) => getDocument(tx, ctx.tenant, id));
  if (!doc || doc.status !== "ready" || doc.fileType !== "pdf" || (doc.pageCount !== null && page > doc.pageCount)) throw new AppError("not_found");
  const png = await renderPdfPage(await storage.get(doc.storageKey), page);
  return new Response(Buffer.from(png), {
    headers: { "content-type": "image/png", "x-content-type-options": "nosniff", "cache-control": "private, max-age=600", "x-request-id": requestId },
  });
});
