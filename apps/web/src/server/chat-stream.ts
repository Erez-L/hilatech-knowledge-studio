import "server-only";
import { answerQuestion, type AnswerEvent, type Services } from "@hks/core";
import { usageSince, withTenant, type Owner, type TenantContext } from "@hks/database";
import { AppError, isAppError, log } from "@hks/shared";
import { z } from "zod";

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  conversationId: z.uuid().optional(),
  locale: z.enum(["he", "en"]),
  // Narrow the question to chosen documents of the active project.
  documentIds: z.array(z.uuid()).max(50).optional(),
});

export async function assertDailyQuestionLimit(services: Services, ctx: TenantContext, limit: number) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const used = await withTenant(services.db, ctx.organizationId, (tx) => usageSince(tx, ctx.organizationId, startOfDay));
  if (used.questions >= limit) throw new AppError("budget_exceeded", "The daily question limit has been reached");
}

/**
 * Streams an answer as Server-Sent Events. Each event is one JSON object on a
 * `data:` line. The stream ends after a `done` or `error` event. If the client
 * disconnects, generation is cancelled and the partial answer is recorded as such.
 */
export function chatEventStream(
  services: Services,
  ctx: TenantContext,
  owner: Owner,
  input: z.output<typeof chatRequestSchema>,
  requestId: string,
  signal: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  signal.addEventListener("abort", () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnswerEvent | { type: "error"; code: string; messageId: null }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          abort.abort(); // the client went away
        }
      };
      try {
        for await (const event of answerQuestion(services, ctx, owner, { ...input, correlationId: requestId, signal: abort.signal })) {
          send(event);
        }
      } catch (error) {
        const code = isAppError(error) ? error.code : "internal";
        if (!isAppError(error)) log("error", "chat.stream_failed", { requestId, name: (error as Error)?.name ?? "unknown" });
        send({ type: "error", code, messageId: null });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
      "x-request-id": requestId,
    },
  });
}
