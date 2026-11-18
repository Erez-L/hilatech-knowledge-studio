import { readSummary, summarizeDocument } from "@hks/core";
import { AppError } from "@hks/shared";
import { z } from "zod";
import { requireContext } from "@/server/context";
import { enforceRateLimit, json, route, uuidParam } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";
export const maxDuration = 180;

const localeSchema = z.enum(["he", "en"]);
const view = (summary: NonNullable<Awaited<ReturnType<typeof readSummary>>>) => ({ ...summary, createdAt: summary.createdAt.toISOString() });

/** The saved summary of a document in one language, or 404 when none has been made. */
export const GET = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const locale = localeSchema.safeParse(new URL(request.url).searchParams.get("locale"));
  if (!locale.success) throw new AppError("validation", "Invalid language");
  const summary = await readSummary(getServices(), ctx.tenant, uuidParam(params.id), locale.data);
  if (!summary) throw new AppError("not_found");
  return json({ summary: view(summary) }, requestId);
});

/** Reads the whole document with the chat model, marks its key passages and saves the summary. */
export const POST = route<{ id: string }>(async ({ request, params, requestId }) => {
  const ctx = await requireContext(request);
  const parsed = z.object({ locale: localeSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError("validation", "Invalid language");
  await enforceRateLimit("summary", ctx.user.id, 20, 3600);
  const summary = await summarizeDocument(getServices(), ctx.tenant, {
    documentId: uuidParam(params.id), locale: parsed.data.locale, userId: ctx.user.id, correlationId: requestId, signal: request.signal,
  });
  return json({ summary: view(summary) }, requestId, 201);
});
