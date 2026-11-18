import { can, requireContext } from "@/server/context";
import { json, route } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

export const GET = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  const { config, chat, embeddings } = getServices();
  return json(
    {
      user: ctx.user,
      organization: ctx.organization,
      project: ctx.project,
      role: ctx.role,
      organizations: ctx.memberships.map((m) => ({ id: m.organizationId, name: m.organizationName, role: m.role })),
      capabilities: {
        upload: can(ctx, "documents.upload"),
        deleteAnyDocument: can(ctx, "documents.delete_any"),
        manageMembers: can(ctx, "members.manage"),
        manageProjects: can(ctx, "projects.manage"),
      },
      pipeline: {
        // "sample": deterministic test doubles are active. "unconfigured": no provider is set.
        mode: config.pipelineMode,
        answering: Boolean(chat && embeddings),
        indexing: Boolean(embeddings),
      },
      limits: {
        uploadMaxBytes: config.UPLOAD_MAX_BYTES,
        scannedPdfPages: config.OCR_PROVIDER === "none" ? 0 : config.OCR_MAX_PAGES,
        questionsPerDay: config.LIMIT_QUESTIONS_PER_DAY,
        questionMaxChars: 2000,
      },
    },
    requestId,
  );
});
