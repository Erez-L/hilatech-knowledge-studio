import { renderPdfPage } from "@hks/ai";
import { AppError } from "@hks/shared";
import { findReadableDocument } from "@/server/cited-document";
import { requireContext } from "@/server/context";
import { enforceRateLimit, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

/** One page of a PDF as a PNG image, rendered on the server after an authorization check. */
export const GET = route<{ id: string; page: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const id = uuidParam(params.id);
  const page = Number(params.page);
  if (!Number.isInteger(page) || page < 1) throw new AppError("not_found");
  await enforceRateLimit("page-render", ctx.user.id, 120, 60);

  const { storage } = getServices();
  // Also a document moved to another project of the organization, so old citations keep opening.
  const doc = (await findReadableDocument(ctx, id))?.document;
  if (!doc || doc.fileType !== "pdf") throw new AppError("not_found");
  if (doc.pageCount !== null && page > doc.pageCount) throw new AppError("not_found");

  const png = await renderPdfPage(await storage.get(doc.storageKey), page);
  return new Response(Buffer.from(png), {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.byteLength),
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
      "x-request-id": requestId,
    },
  });
});
