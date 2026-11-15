import { AppError } from "@hks/shared";
import { assertDailyQuestionLimit, chatEventStream, chatRequestSchema } from "@/server/chat-stream";
import { requireContext } from "@/server/context";
import { enforceRateLimit, route } from "@/server/http";
import { getServices } from "@/server/services";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = route(async ({ request, requestId }) => {
  const ctx = await requireContext(request);
  const services = getServices();
  const { config } = services;
  if (!services.chat || !services.embeddings) throw new AppError("provider_not_configured", "Answering is not configured");

  const raw = await request.text();
  if (raw.length > 16 * 1024) throw new AppError("payload_too_large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError("bad_request", "Invalid JSON");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) throw new AppError("validation", "Enter a question of up to 2,000 characters");

  await enforceRateLimit("chat", ctx.user.id, config.LIMIT_QUESTIONS_PER_MINUTE, 60);
  await assertDailyQuestionLimit(services, ctx.tenant, config.LIMIT_QUESTIONS_PER_DAY);

  return chatEventStream(services, ctx.tenant, { userId: ctx.user.id }, parsed.data, requestId, request.signal);
});
