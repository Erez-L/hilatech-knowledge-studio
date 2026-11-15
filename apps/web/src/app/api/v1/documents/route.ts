import { uploadDocument } from "@hks/core";
import { countDocumentsSince, latestIngestionJob, listDocuments, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { requireCapability, requireContext } from "@/server/context";
import { enforceRateLimit, json, route } from "@/server/http";
import { getServices } from "@/server/services";
import { documentView } from "@/server/views";

export const runtime = "nodejs";

export const GET = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  const { db } = getServices();
  const search = new URL(request.url).searchParams.get("q")?.slice(0, 200) ?? undefined;
  const documents = await withTenant(db, ctx.tenant.organizationId, async (tx) => {
    const rows = await listDocuments(tx, ctx.tenant, { search });
    return Promise.all(
      rows.map(async (doc) =>
        documentView(doc, doc.status === "queued" || doc.status === "processing" ? await latestIngestionJob(tx, ctx.tenant, doc.id) : null),
      ),
    );
  });
  return json({ documents }, requestId);
});

/** Upload: multipart form with one `file` field. Authenticated users only; there is no public upload. */
export const POST = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  requireCapability(ctx, "documents.upload");
  const services = getServices();
  const { config, db } = services;

  await enforceRateLimit("upload", ctx.user.id, config.LIMIT_UPLOADS_PER_MINUTE, 60);
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const today = await withTenant(db, ctx.tenant.organizationId, (tx) => countDocumentsSince(tx, ctx.tenant, startOfDay));
  if (today >= config.LIMIT_UPLOADS_PER_DAY) throw new AppError("budget_exceeded", "The daily upload limit for this organization has been reached");

  // Refuse oversized bodies before reading them. 64 KB allows for multipart framing.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!declared) throw new AppError("bad_request", "Content-Length is required");
  if (declared > config.UPLOAD_MAX_BYTES + 64 * 1024) {
    throw new AppError("payload_too_large", `Files can be up to ${Math.floor(config.UPLOAD_MAX_BYTES / (1024 * 1024))} MB`);
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new AppError("bad_request", "Expected a multipart upload");

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    throw new AppError("bad_request", "The upload could not be read");
  }
  if (!(file instanceof File)) throw new AppError("validation", "Choose a file to upload");

  const document = await uploadDocument(
    services,
    ctx.tenant,
    { kind: "user", userId: ctx.user.id },
    { filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), correlationId: requestId },
  );
  // 202: accepted for processing. The document is not ready yet.
  return json({ document: documentView(document, { step: null, progress: 0 } as never) }, requestId, 202);
});
