import { listDocuments, withTenant } from "@hks/database";
import { isAppError } from "@hks/shared";
import { json, route } from "@/server/http";
import { requireDemoContext } from "@/server/demo";
import { getServices } from "@/server/services";
import { documentView } from "@/server/views";

export const runtime = "nodejs";

/**
 * Status of the public demo, in the same shape as /api/v1/me so the workspace
 * UI can run against either. Also starts the visitor's anonymous session.
 */
export const GET = route(async ({ request, requestId }) => {
  let ctx;
  try {
    ctx = await requireDemoContext(request, { issue: true });
  } catch (error) {
    if (isAppError(error) && error.code === "not_configured") return json({ available: false }, requestId);
    throw error;
  }
  const { config, db, chat, embeddings } = getServices();
  const documents = await withTenant(db, ctx.tenant.organizationId, (tx) => listDocuments(tx, ctx.tenant));
  if (!chat || !embeddings) return json({ available: false }, requestId);

  const response = json(
    {
      available: true,
      me: {
        user: { id: "demo", email: "", name: null, locale: "en" },
        organization: { id: "demo", name: "Northstar Business Services", kind: "demo" },
        role: "member",
        capabilities: { upload: false, deleteAnyDocument: false, manageMembers: false },
        pipeline: { mode: config.pipelineMode, answering: true, indexing: false },
        limits: { uploadMaxBytes: 0, questionsPerDay: config.LIMIT_DEMO_QUESTIONS_PER_SESSION, questionMaxChars: 2000 },
      },
      documents: documents.filter((d) => d.status === "ready").map((d) => documentView(d)),
    },
    requestId,
  );
  if (ctx.setCookie) response.headers.append("set-cookie", ctx.setCookie);
  return response;
});
