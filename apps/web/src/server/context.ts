import "server-only";
import { listMemberships, type MembershipView, type Role, type TenantContext } from "@hks/database";
import { AppError } from "@hks/shared";
import { getAuth } from "./auth";
import { getServices } from "./services";

export type RequestContext = {
  user: { id: string; email: string; name: string | null; locale: "he" | "en" };
  sessionId: string;
  organization: { id: string; name: string; kind: "standard" | "demo" };
  role: Role;
  /** The ONLY tenant this request may touch. Derived from the session, never from request parameters. */
  tenant: TenantContext;
  memberships: MembershipView[];
};

export const ORGANIZATION_HEADER = "x-hks-organization";

/**
 * Authenticates the request and resolves its tenant.
 *
 * Organization and workspace ids are never read from the URL, query or body.
 * A caller may name one of THEIR OWN organizations in a header to switch
 * between them; anything else is ignored in favour of their first membership.
 */
export async function requireContext(request: Request): Promise<RequestContext> {
  const { db } = getServices();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new AppError("unauthenticated", "Sign in to continue");

  const memberships = await listMemberships(db, session.user.id);
  const requested = request.headers.get(ORGANIZATION_HEADER);
  const active = memberships.find((m) => m.organizationId === requested) ?? memberships[0];
  if (!active) throw new AppError("forbidden", "Your account does not belong to an organization");

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      locale: (session.user as { locale?: string }).locale === "he" ? "he" : "en",
    },
    sessionId: session.session.id,
    organization: { id: active.organizationId, name: active.organizationName, kind: active.organizationKind },
    role: active.role,
    tenant: { organizationId: active.organizationId, workspaceId: active.workspaceId },
    memberships,
  };
}

export type Capability = "documents.upload" | "documents.delete_any" | "members.view" | "members.manage";

const CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set(["documents.upload", "documents.delete_any", "members.view", "members.manage"]),
  admin: new Set(["documents.upload", "documents.delete_any", "members.view", "members.manage"]),
  member: new Set(["documents.upload", "members.view"]),
};

export const can = (ctx: RequestContext, capability: Capability) => CAPABILITIES[ctx.role].has(capability);

export function requireCapability(ctx: RequestContext, capability: Capability) {
  if (!can(ctx, capability)) throw new AppError("forbidden", "Your role does not allow this action");
}
