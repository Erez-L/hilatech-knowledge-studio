import { listDocumentChunks, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { findReadableDocument } from "@/server/cited-document";
import { requireContext } from "@/server/context";
import { json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/**
 * Extracted text of a document, for the source viewer. `?page=N` returns the
 * chunks that cover one PDF page; without it, all chunks in reading order.
 * Overlapping text between neighbouring chunks is removed for display.
 * A document moved to another project of the organization is still served (an old answer's
 * citation must keep opening), with `movedTo` naming the project it is in now.
 */
export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const pageParam = new URL(request.url).searchParams.get("page");
  const page = pageParam === null ? undefined : Number(pageParam);
  if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > 100_000)) throw new AppError("validation", "Invalid page");

  const found = await findReadableDocument(ctx, id);
  if (!found) throw new AppError("not_found");
  const result = {
    doc: found.document,
    chunks: await withTenant(getServices().db, found.tenant.organizationId, (tx) => listDocumentChunks(tx, found.tenant, id, { pageNumber: page })),
  };

  return json(
    {
      document: { id: result.doc.id, title: result.doc.title, fileType: result.doc.fileType, pageCount: result.doc.pageCount, status: result.doc.status },
      page: page ?? null,
      movedTo: found.movedTo,
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
