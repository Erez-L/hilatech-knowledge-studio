import { getDocument, listDocumentChunks, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireDemoContext } from "@/server/demo";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/** Extracted text of a DEMO document. Lookups are scoped to the demo tenant, so no other document can be read here. */
export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireDemoContext(request);
  const id = uuidParam(params.id);
  const pageParam = new URL(request.url).searchParams.get("page");
  const page = pageParam === null ? undefined : Number(pageParam);
  if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > 100_000)) throw new AppError("validation", "Invalid page");
  const result = await withTenant(getServices().db, ctx.tenant.organizationId, async (tx) => {
    const doc = await getDocument(tx, ctx.tenant, id);
    if (!doc || doc.status !== "ready") return null;
    return { doc, chunks: await listDocumentChunks(tx, ctx.tenant, id, { pageNumber: page }) };
  });
  if (!result) throw new AppError("not_found");
  return json(
    {
      document: { id: result.doc.id, title: result.doc.title, fileType: result.doc.fileType, pageCount: result.doc.pageCount, status: result.doc.status },
      page: page ?? null,
      chunks: result.chunks.map((c) => ({ id: c.id, index: c.chunkIndex, pageNumber: c.pageNumber, pageEnd: c.pageEnd, sectionPath: c.sectionPath, text: c.text })),
    },
    requestId,
  );
});
