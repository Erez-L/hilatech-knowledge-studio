import pg from "pg";
import { createDatabase, migrate, type Database } from "../src/index.ts";

export const APP_URL = process.env.DATABASE_URL!;
export const OWNER_URL = process.env.DATABASE_MIGRATION_URL!;

const TABLES = [
  "audit_events", "contact_leads", "usage_events", "citations", "messages", "conversations",
  "ingestion_jobs", "chunk_embeddings", "embedding_indexes", "document_chunks", "documents",
  "workspaces", "memberships", "sessions", "accounts", "verifications", "users", "organizations", "schema_migrations",
];

/** Drops every table and re-applies migrations. Uses the owner role. */
export async function resetDatabase() {
  const client = new pg.Client({ connectionString: OWNER_URL });
  await client.connect();
  try {
    await client.query(`drop table if exists ${TABLES.join(", ")} cascade`);
  } finally {
    await client.end();
  }
  return migrate(OWNER_URL);
}

export function appDatabase(): Database {
  return createDatabase(APP_URL, { max: 4 });
}

/** A unit vector pointing mostly along axis `axis`, with a little of `mix`. */
export function vectorAlong(axis: number, mix: number | null = null, weight = 0.2, dimensions = 1024): number[] {
  const v = new Array<number>(dimensions).fill(0);
  v[axis] = 1;
  if (mix !== null) v[mix] = weight;
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}
