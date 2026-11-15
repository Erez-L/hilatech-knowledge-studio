import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { contactSchema, fieldErrors, type ContactResponse } from "@/lib/contact";
import { getLeadStore } from "@/lib/lead-store";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

// Per-process limiter. Good enough for a single instance; the functional
// milestone replaces it with the shared Redis limiter.
const hits = new Map<string, number[]>();

function rateLimited(key: string, now: number) {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

function reply(body: ContactResponse, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const fail = (code: Extract<ContactResponse, { ok: false }>["error"]["code"], status: number, fields?: object) =>
    reply({ ok: false, error: { code, requestId }, ...(fields ? { fields } : {}) }, status, requestId);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip, Date.now())) return fail("rate_limited", 429);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return fail("bad_request", 413);

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail("bad_request", 400);
  }

  const parsed = contactSchema.safeParse(json);
  if (!parsed.success) return fail("validation", 422, fieldErrors(parsed.error));

  // Filled honeypot is rejected by the schema above (max length 0).
  const store = getLeadStore();
  if (!store) {
    console.warn(JSON.stringify({ level: "warn", event: "contact.not_configured", requestId }));
    return fail("not_configured", 503);
  }

  try {
    const { website: _honeypot, ...lead } = parsed.data;
    void _honeypot;
    await store.save({ ...lead, receivedAt: new Date().toISOString(), requestId });
    // No personal data in logs.
    console.info(JSON.stringify({ level: "info", event: "contact.received", requestId, locale: lead.locale }));
    return reply({ ok: true }, 201, requestId);
  } catch {
    console.error(JSON.stringify({ level: "error", event: "contact.store_failed", requestId }));
    return fail("internal", 500);
  }
}
