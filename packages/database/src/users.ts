import { eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { users, type Locale } from "./schema.ts";

export type UserRow = typeof users.$inferSelect;

/**
 * Inserts a user row directly. Authentication (credentials, sessions) is
 * owned by Better Auth; this exists for seeding and tests that need a user
 * without going through sign-up. `passwordHash` is ignored by the app.
 */
export async function createUser(
  db: Db,
  input: { email: string; name: string | null; passwordHash?: string; locale: Locale; emailVerified?: boolean },
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
