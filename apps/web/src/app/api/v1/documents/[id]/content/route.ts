import { getDocument, listDocumentChunks, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/**
 * Extracted text of a document, for the source viewer. `?page=N` returns the
 * chunks that cover one PDF page; without it, all chunks in reading order.
 * Overlapping text between neighbouring chunks is removed for display.
 */
export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const pageParam = new URL(request.url).searchParams.get("page");
  const page = pageParam === null ? undefined : Number(pageParam);
  if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > 100_000)) throw new AppError("validation", "Invalid page");

  const result = await withTenant(getServices().db, ctx.tenant.organizationId, async (tx) => {
    const doc = await getDocument(tx, ctx.tenant, id);
    if (!doc || doc.status === "deleting") return null;
    return { doc, chunks: await listDocumentChunks(tx, ctx.tenant, id, { pageNumber: page }) };
  });
  if (!result) throw new AppError("not_found");

  return json(
    {
      document: { id: result.doc.id, title: result.doc.title, fileType: result.doc.fileType, pageCount: result.doc.pageCount, status: result.doc.status },
      page: page ?? null,
      chunks: result.chunks.map((chunk) => ({
        id: chunk.id,
        index: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        pageEnd: chunk.pageEnd,
        sectionPath: chunk.sectionPath,
        text: chunk.text,
      })),
    },
    requestId,
  );
});
