import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Db, Executor } from "./client.ts";
import { withTenant, type TenantContext } from "./client.ts";
import { documents, memberships, organizations, users, workspaces } from "./schema.ts";

export type Role = "owner" | "admin" | "member";
export type MembershipView = {
  organizationId: string;
  organizationName: string;
  organizationKind: "standard" | "demo";
  role: Role;
  workspaceId: string;
  workspaceName: string;
};

/** Every organization id, oldest first. Organizations are not tenant rows (no row level security). */
export async function listOrganizationIds(db: Db): Promise<string[]> {
  const rows = await db.select({ id: organizations.id }).from(organizations).orderBy(organizations.createdAt, organizations.id);
  return rows.map((row) => row.id);
}

/** Creates an organization, its default workspace and the owner membership. */
export async function createOrganizationWithOwner(
  db: Db,
  input: { name: string; slug: string; ownerUserId: string; kind?: "standard" | "demo" },
) {
  const [org] = await db
    .insert(organizations)
    .values({ name: input.name, slug: input.slug, kind: input.kind ?? "standard" })
    .returning();
  if (!org) throw new Error("organization insert returned no row");
  return withTenant(db, org.id, async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ organizationId: org.id, name: "Main", slug: "main" })
      .returning();
    if (!workspace) throw new Error("workspace insert returned no row");
    await tx.insert(memberships).values({ organizationId: org.id, userId: input.ownerUserId, role: "owner" });
    return { organization: org, workspace };
  });
}

/**
 * Memberships of one user, with each organization's default workspace.
 * Cross-tenant by nature (keyed by user), so it reads organizations and
 * memberships (no tenant policy) and then each workspace under its own tenant.
 */
export async function listMemberships(db: Db, userId: string): Promise<MembershipView[]> {
  const rows = await db
    .select({ m: memberships, o: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId));
  const result: MembershipView[] = [];
  for (const { m, o } of rows) {
    const workspace = await withTenant(db, o.id, (tx) => defaultWorkspace(tx, o.id));
    if (!workspace) continue;
    result.push({
      organizationId: o.id,
      organizationName: o.name,
      organizationKind: o.kind,
      role: m.role,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
  }
  return result;
}

export async function defaultWorkspace(tx: Executor, organizationId: string) {
  const [workspace] = await tx
    .select()
    .from(workspaces)
    .where(eq(workspaces.organizationId, organizationId))
    .orderBy(workspaces.createdAt)
    .limit(1);
  return workspace ?? null;
}

export async function getMembership(db: Db, userId: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function getDemoOrganization(db: Db) {
  const [org] = await db.select().from(organizations).where(eq(organizations.kind, "demo")).limit(1);
  return org ?? null;
}

/* ----------------------------------------------------------------- members */

export type MemberView = { userId: string; email: string; name: string | null; role: Role; joinedAt: Date };

export async function listMembers(db: Db, organizationId: string): Promise<MemberView[]> {
  const rows = await db
    .select({ m: memberships, u: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(memberships.createdAt);
  return rows.map(({ m, u }) => ({ userId: u.id, email: u.email, name: u.name, role: m.role, joinedAt: m.createdAt }));
}

export async function addMember(db: Db, organizationId: string, userId: string, role: Role) {
  const inserted = await db.insert(memberships).values({ organizationId, userId, role }).onConflictDoNothing().returning();
  return inserted.length > 0;
}

/**
 * Changes a role or removes a member, refusing to leave an organization
 * without an owner. Runs in one transaction with the owner rows locked.
 */
export async function changeMember(
  db: Db,
  organizationId: string,
  userId: string,
  change: { role: Role } | { remove: true },
): Promise<"ok" | "not_found" | "last_owner"> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.organizationId, organizationId))
      .for("update");
    const target = rows.find((row) => row.userId === userId);
    if (!target) return "not_found";
    const owners = rows.filter((row) => row.role === "owner");
    const losesOwner = target.role === "owner" && ("remove" in change || change.role !== "owner");
    if (losesOwner && owners.length <= 1) return "last_owner";
    if ("remove" in change) await tx.delete(memberships).where(eq(memberships.id, target.id));
    else await tx.update(memberships).set({ role: change.role }).where(eq(memberships.id, target.id));
    return "ok";
  });
}

/* -------------------------------------------------------------------- demo */

/**
 * The single public-demo organization and its workspace. It has no members:
 * nobody signs in to it, so nobody can upload to it or delete from it through
 * the authenticated API. Content is loaded only by the seed script.
 */
export async function ensureDemoOrganization(db: Db): Promise<TenantContext> {
  let org = await getDemoOrganization(db);
  if (!org) {
    await db
      .insert(organizations)
      .values({ name: "Northstar Business Services (demo)", slug: "public-demo", kind: "demo" })
      .onConflictDoNothing();
    org = await getDemoOrganization(db);
  }
  if (!org) throw new Error("could not create the demo organization");
  const organizationId = org.id;
  const workspace = await withTenant(db, organizationId, async (tx) => {
    const existing = await defaultWorkspace(tx, organizationId);
    if (existing) return existing;
    const [created] = await tx.insert(workspaces).values({ organizationId, name: "Demo", slug: "demo" }).returning();
    return created!;
  });
  return { organizationId, workspaceId: workspace.id };
}

/* ---------------------------------------------------------------- projects */

/**
 * A project is a workspace: its own documents, index and conversations. Questions are answered
 * from one project, so unrelated subjects kept in separate projects never mix in an answer.
 */
export type ProjectView = { id: string; name: string; slug: string; createdAt: Date; documentCount: number; isDefault: boolean };

export const MAX_PROJECTS_PER_ORGANIZATION = 50;

/** The organization's projects, oldest first. The oldest one is the default. */
export async function listProjects(tx: Executor, organizationId: string): Promise<ProjectView[]> {
  const rows = await tx
    .select({
      w: workspaces,
      // The outer column is written out in full: an unqualified "id" here would bind to documents.id.
      documentCount: sql<string>`(select count(*) from documents d where d.workspace_id = "workspaces"."id")`,
    })
    .from(workspaces)
    .where(eq(workspaces.organizationId, organizationId))
    .orderBy(workspaces.createdAt);
  return rows.map(({ w, documentCount }, index) => ({
    id: w.id, name: w.name, slug: w.slug, createdAt: w.createdAt, documentCount: Number(documentCount), isDefault: index === 0,
  }));
}

export async function getProject(tx: Executor, organizationId: string, projectId: string) {
  const [row] = await tx
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.id, projectId)))
    .limit(1);
  return row ?? null;
}

const cleanProjectName = (name: string) => name.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);

/** Returns null when the organization already has the maximum number of projects. */
export async function createProject(tx: Executor, organizationId: string, name: string) {
  const clean = cleanProjectName(name);
  if (!clean) return null;
  const [{ n } = { n: "0" }] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(workspaces)
    .where(eq(workspaces.organizationId, organizationId));
  if (Number(n) >= MAX_PROJECTS_PER_ORGANIZATION) return null;
  // The slug only has to be unique and well-formed; names may be in any script.
  const slug = `p-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const [created] = await tx.insert(workspaces).values({ organizationId, name: clean, slug }).returning();
  return created ?? null;
}

export async function renameProject(tx: Executor, organizationId: string, projectId: string, name: string) {
  const clean = cleanProjectName(name);
  if (!clean) return null;
  const [updated] = await tx
    .update(workspaces)
    .set({ name: clean, updatedAt: new Date() })
    .where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.id, projectId)))
    .returning();
  return updated ?? null;
}

/**
 * Deletes a project only when it holds no documents: stored files are removed by the document
 * deletion path, and deleting rows underneath it would orphan them. The default project stays.
 */
export async function deleteEmptyProject(tx: Executor, organizationId: string, projectId: string): Promise<"deleted" | "not_found" | "not_empty" | "is_default"> {
  const projects = await listProjects(tx, organizationId);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return "not_found";
  if (project.isDefault) return "is_default";
  // Counted again on its own, in this transaction: deleting a project that still has documents
  // would cascade over their rows and leave their stored files behind.
  const [{ n } = { n: "1" }] = await tx.select({ n: sql<string>`count(*)` }).from(documents).where(eq(documents.workspaceId, projectId));
  if (project.documentCount > 0 || Number(n) > 0) return "not_empty";
  await tx.delete(workspaces).where(and(eq(workspaces.organizationId, organizationId), eq(workspaces.id, projectId)));
  return "deleted";
}
