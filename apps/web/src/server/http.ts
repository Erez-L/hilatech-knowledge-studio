import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isUuid, recordAudit } from "@hks/database";
import { AppError, getConfig, isAppError, log } from "@hks/shared";
import { clientIp } from "@/lib/client-ip";
import { getServices } from "./services";
import { MAX_API_BODY_BYTES } from "./body";

export type ApiError = { error: { code: string; message: string; requestId: string } };

/** Messages are our own fixed strings (AppError.detail); unknown errors never leak details. */
export function errorResponse(error: unknown, requestId: string, extraHeaders: Record<string, string> = {}) {
  const app = isAppError(error) ? error : new AppError("internal");
  if (!isAppError(error)) {
    log("error", "http.unhandled", { requestId, name: (error as Error)?.name ?? "unknown", message: String((error as Error)?.message ?? "").slice(0, 200) });
  }
  const body: ApiError = { error: { code: app.code, message: app.detail ?? defaultMessage(app.code), requestId } };
  return NextResponse.json(body, {
    status: app.status,
    headers: { "x-request-id": requestId, "cache-control": "no-store", ...extraHeaders },
  });
}

const defaultMessage = (code: string) =>
  ({ unauthenticated: "Sign in to continue", forbidden: "You do not have access to this", not_found: "Not found", internal: "Something went wrong" })[code] ?? code;

export function json(data: unknown, requestId: string, status = 200) {
  return NextResponse.json(data, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

type Handler<P> = (input: { request: Request; params: P; requestId: string }) => Promise<Response>;

/**
 * Wraps a route handler with: a request id, same-origin enforcement for
 * state-changing requests (the session lives in a cookie), and uniform errors.
 */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (request: Request, segment: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        assertSameOrigin(request);
        // Small JSON bodies everywhere except the upload, which checks its own, larger limit.
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > MAX_API_BODY_BYTES && new URL(request.url).pathname !== "/api/v1/documents") throw new AppError("payload_too_large");
      }
      return await handler({ request, params: await segment.params, requestId });
    } catch (error) {
      if (isAppError(error) && error.code === "rate_limited") {
        return errorResponse(error, requestId, { "retry-after": String((error as AppError & { retryAfter?: number }).retryAfter ?? 60) });
      }
      return errorResponse(error, requestId);
    }
  };
}

/** Cross-site requests cannot change state: the Origin header must be ours. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new URL(getConfig().APP_BASE_URL).origin;
  if (!origin || origin !== allowed) throw new AppError("forbidden", "Cross-origin request refused");
}

export function uuidParam(value: string | undefined): string {
  if (!isUuid(value)) throw new AppError("not_found");
  return value;
}

/** Per-identity rate limit backed by Redis. Throws `rate_limited` with a Retry-After hint. */
export async function enforceRateLimit(rule: string, key: string, limit: number, windowSeconds: number) {
  const result = await getServices().limiter.hit(rule, key, limit, windowSeconds);
  if (!result.allowed) {
    throw Object.assign(new AppError("rate_limited", "Too many requests. Try again shortly"), { retryAfter: result.retryAfterSeconds });
  }
}

/** Client address for rate limiting, or a shared bucket when it cannot be trusted. */
export const rateKeyFor = (request: Request) => clientIp(request.headers) ?? "unidentified";

/** Records a denied or failed sensitive action. Never throws. */
export async function auditDenied(action: string, ctx: { organizationId: string | null; userId: string | null }, requestId: string, metadata: Record<string, string> = {}) {
  try {
    const { db } = getServices();
    await recordAudit(db, {
      organizationId: null, // written without tenant context; kept global on purpose
      actorUserId: ctx.userId,
      actorKind: ctx.userId ? "user" : "anonymous",
      action,
      outcome: "denied",
      metadata: { ...metadata, ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}) },
      correlationId: requestId,
    });
  } catch {
    /* auditing must not break the response */
  }
}
