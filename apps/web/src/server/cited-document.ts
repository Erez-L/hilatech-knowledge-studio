import "server-only";
import { findDocumentInOrganization, withTenant, type DocumentRow, type TenantContext } from "@hks/database";
import { getServices } from "./services";
import type { RequestContext } from "./context";

/**
 * Resolves a document for READING (text, page image, original file), the way a citation needs it:
 * in the active project, or, when it was moved since, in the project of the same organization that
 * holds it now. `movedTo` names that project. Every member of an organization may open all of its
 * projects, so this widens nothing; it only stops an old answer's citations from breaking after a
 * move. Anything that changes a document stays scoped to the active project.
 */
export async function findReadableDocument(
  ctx: RequestContext,
  documentId: string,
): Promise<{ document: DocumentRow; tenant: TenantContext; movedTo: { id: string; name: string } | null } | null> {
  const organizationId = ctx.tenant.organizationId;
  const found = await withTenant(getServices().db, organizationId, (tx) => findDocumentInOrganization(tx, organizationId, documentId));
  if (!found || found.document.status === "deleting") return null;
  const tenant = { organizationId, workspaceId: found.document.workspaceId };
  const movedTo = found.document.workspaceId === ctx.tenant.workspaceId ? null : found.project;
  return { document: found.document, tenant, movedTo };
}
