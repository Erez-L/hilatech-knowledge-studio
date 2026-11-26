import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createMailer, notifyLead, type Mailer } from "@hks/core";
import { getConfig } from "@hks/shared";
import { contactSchema, fieldErrors, type ContactResponse } from "@/lib/contact";
import { clientIp } from "@/lib/client-ip";
import { getLeadStore } from "@/lib/lead-store";
import { MemoryRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;

// Per client address when it can be trusted (see lib/client-ip.ts). Requests
// with no trustworthy address share one bucket, so a missing or forged
// X-Forwarded-For header can never be used to escape the limit.
// With Redis configured the limit is shared by every instance; without it
// (static preview deployments) it falls back to this process's memory.
const memoryPerClient = new MemoryRateLimiter(5, 60_000);
const memoryUnidentified = new MemoryRateLimiter(30, 60_000);

async function checkLimit(ip: string | null): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (process.env.REDIS_URL) {
    try {
      const { getServices } = await import("@/server/services");
      return await getServices().limiter.hit("contact", ip ?? "unidentified", ip ? 5 : 30, 60);
    } catch {
      // Redis unreachable: keep limiting locally rather than failing open.
    }
  }
  return ip ? memoryPerClient.hit(ip) : memoryUnidentified.hit("unidentified");
}

// One mail transport per server process, created on the first request that needs it.
let mailer: Mailer | null | undefined;

/** Mails the stored request to the owner address in LEADS_NOTIFY_EMAIL, when one is set. Never throws. */
async function notifyOwner(lead: Parameters<typeof notifyLead>[2]) {
  try {
    const config = getConfig();
    if (!config.LEADS_NOTIFY_EMAIL) return;
    if (mailer === undefined) mailer = createMailer(config);
    await notifyLead(mailer, config.LEADS_NOTIFY_EMAIL, lead);
  } catch {
    console.error(JSON.stringify({ level: "error", event: "contact.notify_failed", requestId: lead.requestId }));
  }
}

function reply(body: ContactResponse, status: number, requestId: string, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "x-request-id": requestId, "cache-control": "no-store", ...extraHeaders },
  });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const fail = (code: Extract<ContactResponse, { ok: false }>["error"]["code"], status: number, fields?: object) =>
    reply({ ok: false, error: { code, requestId }, ...(fields ? { fields } : {}) }, status, requestId);

  const ip = clientIp(request.headers);
  const limit = await checkLimit(ip);
  if (!limit.allowed) {
    return reply({ ok: false, error: { code: "rate_limited", requestId } }, 429, requestId, {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

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
    const stored = { ...lead, receivedAt: new Date().toISOString(), requestId };
    await store.save(stored);
    // No personal data in logs.
    console.info(JSON.stringify({ level: "info", event: "contact.received", requestId, locale: lead.locale }));
    // The request is saved; a mail problem from here on is logged and does not fail the form.
    await notifyOwner(stored);
    return reply({ ok: true }, 201, requestId);
  } catch {
    console.error(JSON.stringify({ level: "error", event: "contact.store_failed", requestId }));
    return fail("internal", 500);
  }
}
