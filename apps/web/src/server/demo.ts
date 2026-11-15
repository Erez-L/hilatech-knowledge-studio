import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDemoOrganization, defaultWorkspace, withTenant, type TenantContext } from "@hks/database";
import { AppError } from "@hks/shared";
import { getServices } from "./services";

export const DEMO_COOKIE = "hks_demo";
const MAX_AGE_SECONDS = 24 * 3600;

export type DemoContext = {
  /** Always the demo organization. Nothing in the request can change it. */
  tenant: TenantContext;
  /** Anonymous visitor id from a signed cookie; conversations belong to it. */
  demoSessionId: string;
  /** Set when a new cookie must be sent with the response. */
  setCookie: string | null;
};

const sign = (id: string, secret: string) => createHmac("sha256", secret).update(`demo:${id}`).digest("base64url");

function readSession(request: Request, secret: string): string | null {
  const raw = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${DEMO_COOKIE}=`))?.slice(DEMO_COOKIE.length + 1);
  const [id, signature] = raw?.split(".") ?? [];
  if (!id || !signature || !/^[A-Za-z0-9_-]{22,64}$/.test(id)) return null;
  const expected = Buffer.from(sign(id, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

/** The demo tenant, or null when the demo is switched off or has not been seeded. */
export async function demoTenant(): Promise<TenantContext | null> {
  const { config, db } = getServices();
  if (!config.DEMO_ENABLED) return null;
  const org = await getDemoOrganization(db);
  if (!org) return null;
  const workspace = await withTenant(db, org.id, (tx) => defaultWorkspace(tx, org.id));
  return workspace ? { organizationId: org.id, workspaceId: workspace.id } : null;
}

/**
 * Context for a public-demo request. `issue` creates the anonymous session on
 * first contact; without it a missing or forged cookie is refused.
 */
export async function requireDemoContext(request: Request, options: { issue?: boolean } = {}): Promise<DemoContext> {
  const { config } = getServices();
  if (!config.AUTH_SECRET) throw new AppError("not_configured", "The demo is not configured");
  const tenant = await demoTenant();
  if (!tenant) throw new AppError("not_configured", "The demo is not available on this deployment");

  const existing = readSession(request, config.AUTH_SECRET);
  if (existing) return { tenant, demoSessionId: existing, setCookie: null };
  if (!options.issue) throw new AppError("unauthenticated", "The demo session has expired. Reload the page");

  const id = randomBytes(18).toString("base64url");
  const secure = config.APP_BASE_URL.startsWith("https://") ? "; Secure" : "";
  return {
    tenant,
    demoSessionId: id,
    setCookie: `${DEMO_COOKIE}=${id}.${sign(id, config.AUTH_SECRET)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`,
  };
}
