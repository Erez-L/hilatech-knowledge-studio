import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle. Repository functions accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

export type Database = { db: Db; pool: pg.Pool; close: () => Promise<void> };

export function createDatabase(connectionString: string, options: { max?: number } = {}): Database {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** The tenant a unit of work is allowed to touch. */
export type TenantContext = { organizationId: string; workspaceId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/**
 * Runs `work` in a transaction bound to one organization. The setting is
 * transaction-local, so it is safe with pooled connections, and row-level
 * security hides every other tenant's rows for the duration.
 */
export async function withTenant<T>(db: Db, organizationId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isUuid(organizationId)) throw new Error("withTenant requires an organization id");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return work(tx);
  });
}
