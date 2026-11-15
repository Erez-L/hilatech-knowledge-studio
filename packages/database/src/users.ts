import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "./client.ts";
import { sessions, users, type Locale } from "./schema.ts";

export type UserRow = typeof users.$inferSelect;

export async function createUser(
  db: Db,
  input: { email: string; name: string | null; passwordHash: string; locale: Locale },
): Promise<UserRow | null> {
  const [row] = await db
    .insert(users)
    .values({ ...input, email: input.email.trim().toLowerCase() })
    .onConflictDoNothing()
    .returning();
  return row ?? null; // null: the email is already registered
}

export async function findUserByEmail(db: Db, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return row ?? null;
}

export async function getUser(db: Db, userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

export async function createSession(db: Db, input: { userId: string; tokenHash: string; expiresAt: Date }) {
  await db.insert(sessions).values(input);
}

/** Returns the session's user when the token is known, unexpired and the user is enabled. */
export async function findSessionUser(db: Db, tokenHash: string) {
  const [row] = await db
    .select({ user: users, sessionId: sessions.id, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.user.disabledAt) return null;
  return row;
}

export async function deleteSession(db: Db, tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
