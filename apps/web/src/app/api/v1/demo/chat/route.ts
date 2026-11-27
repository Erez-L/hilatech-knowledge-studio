import { usageSince, withTenant } from "@hks/database";
import { AppError } from "@hks/shared";
import { chatEventStream, chatRequestSchema } from "@/server/chat-stream";
import { requireDemoContext } from "@/server/demo";
import { enforceRateLimit, rateKeyFor, route } from "@/server/http";
import { getServices } from "@/server/services";
import { readTextBody } from "@/server/body";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Public demo questions: no sign-in, demo documents only, strict limits.
 * Three limits apply, and each says so honestly when reached:
 * per client address per minute, per visitor session, and a daily cap for
 * the whole demo so model spending is bounded.
 */
export const POST = route(async ({ request, requestId }) => {
  const ctx = await requireDemoContext(request);
  const services = getServices();
  const { config, db, limiter } = services;
  if (!services.chat || !services.embeddings) throw new AppError("provider_not_configured", "Answering is not configured");

  const raw = await readTextBody(request, 16 * 1024);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError("bad_request", "Invalid JSON");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) throw new AppError("validation", "Enter a question of up to 2,000 characters");

  await enforceRateLimit("demo-chat-ip", rateKeyFor(request), config.LIMIT_DEMO_QUESTIONS_PER_MINUTE, 60);
  const session = await limiter.hit("demo-chat-session", ctx.demoSessionId, config.LIMIT_DEMO_QUESTIONS_PER_SESSION, 24 * 3600);
  if (!session.allowed) throw new AppError("budget_exceeded", "You have reached the question limit for this demo session");
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const today = await withTenant(db, ctx.tenant.organizationId, (tx) => usageSince(tx, ctx.tenant.organizationId, startOfDay));
  if (today.questions >= config.LIMIT_DEMO_QUESTIONS_PER_DAY) {
    throw new AppError("budget_exceeded", "The demo has reached its daily limit. It resets at midnight UTC");
  }

  return chatEventStream(services, ctx.tenant, { demoSessionId: ctx.demoSessionId }, parsed.data, requestId, request.signal);
});
