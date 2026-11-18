import "server-only";
import { getProject, isUuid, listMemberships, withTenant, type MembershipView, type Role, type TenantContext } from "@hks/database";
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
  /** The project (workspace) this request works in. */
  project: { id: string; name: string };
  memberships: MembershipView[];
};

export const ORGANIZATION_HEADER = "x-hks-organization";
export const PROJECT_HEADER = "x-hks-project";

/**
 * Authenticates the request and resolves its tenant.
 *
 * Organization and workspace ids are never read from the URL, query or body.
 * A caller may name one of THEIR OWN organizations in a header to switch
 * between them; anything else is ignored in favour of their first membership.
 * The same goes for the project: a header may name a project of the ACTIVE
 * organization, looked up inside that organization; anything else falls back
 * to the organization's default project.
 */
export async function requireContext(request: Request): Promise<RequestContext> {
  const { db } = getServices();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new AppError("unauthenticated", "Sign in to continue");

  const memberships = await listMemberships(db, session.user.id);
  const requested = request.headers.get(ORGANIZATION_HEADER);
  const active = memberships.find((m) => m.organizationId === requested) ?? memberships[0];
  if (!active) throw new AppError("forbidden", "Your account does not belong to an organization");

  let project = { id: active.workspaceId, name: active.workspaceName };
  // Images and downloads are loaded by the browser itself and cannot carry the header.
  const requestedProject =
    request.headers.get(PROJECT_HEADER) ?? (request.method === "GET" ? new URL(request.url).searchParams.get("project") : null);
  if (isUuid(requestedProject) && requestedProject !== project.id) {
    const found = await withTenant(db, active.organizationId, (tx) => getProject(tx, active.organizationId, requestedProject));
    if (found) project = { id: found.id, name: found.name };
  }

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
    tenant: { organizationId: active.organizationId, workspaceId: project.id },
    project,
    memberships,
  };
}

export type Capability = "documents.upload" | "documents.delete_any" | "members.view" | "members.manage" | "projects.manage";

const CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set(["documents.upload", "documents.delete_any", "members.view", "members.manage", "projects.manage"]),
  admin: new Set(["documents.upload", "documents.delete_any", "members.view", "members.manage", "projects.manage"]),
  member: new Set(["documents.upload", "members.view"]),
};

export const can = (ctx: RequestContext, capability: Capability) => CAPABILITIES[ctx.role].has(capability);

export function requireCapability(ctx: RequestContext, capability: Capability) {
  if (!can(ctx, capability)) throw new AppError("forbidden", "Your role does not allow this action");
}
