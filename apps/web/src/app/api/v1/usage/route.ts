import { usageSince, withTenant } from "@hks/database";
import { requireContext } from "@/server/context";
import { json, route } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";

export const GET = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  const { db, config } = getServices();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const used = await withTenant(db, ctx.tenant.organizationId, (tx) => usageSince(tx, ctx.tenant.organizationId, startOfDay));
  return json(
    {
      today: { questions: used.questions, inputTokens: used.inputTokens, outputTokens: used.outputTokens },
      limits: {
        questionsPerDay: config.LIMIT_QUESTIONS_PER_DAY,
        inputTokensPerDay: config.BUDGET_DAILY_INPUT_TOKENS,
        outputTokensPerDay: config.BUDGET_DAILY_OUTPUT_TOKENS,
      },
      // Token totals count real providers only; test-double runs cost nothing.
      note: config.pipelineMode === "live" ? null : "test_doubles_excluded",
    },
    requestId,
  );
});
