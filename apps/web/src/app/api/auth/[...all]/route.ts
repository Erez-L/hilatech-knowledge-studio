import { toNextJsHandler } from "better-auth/next-js";
import { clientIp } from "@/lib/client-ip";
import { CLIENT_IP_HEADER, getAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/**
 * All authentication endpoints are served by Better Auth. Before handing the
 * request over, the client address is resolved from the TRUSTED proxy chain
 * and placed in our own header; any value the client sent for that header is
 * discarded. Better Auth's rate limiter keys on it.
 */
async function handle(request: Request, method: "GET" | "POST") {
  try {
    const headers = new Headers(request.headers);
    headers.set(CLIENT_IP_HEADER, clientIp(request.headers) ?? "0.0.0.0");
    const forwarded = new Request(request, { headers });
    return await toNextJsHandler(getAuth())[method](forwarded);
  } catch (error) {
    return errorResponse(error, crypto.randomUUID());
  }
}

export const GET = (request: Request) => handle(request, "GET");
export const POST = (request: Request) => handle(request, "POST");
