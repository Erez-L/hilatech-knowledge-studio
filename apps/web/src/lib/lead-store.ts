import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { insertContactLead } from "@hks/database";
import type { ContactLead } from "./contact";

type StoredLead = Omit<ContactLead, "website"> & { receivedAt: string; requestId: string };

/** Where demo requests are delivered. */
export interface LeadStore {
  readonly kind: "postgres" | "file";
  save(lead: StoredLead): Promise<void>;
}

/** Durable storage: the `contact_leads` table. The application role can insert leads but cannot read them back. */
class PostgresLeadStore implements LeadStore {
  readonly kind = "postgres" as const;
  async save(lead: StoredLead) {
    const { getServices } = await import("@/server/services");
    await insertContactLead(getServices().db, {
      name: lead.name,
      email: lead.email,
      company: lead.company || null,
      message: lead.message,
      locale: lead.locale,
      requestId: lead.requestId,
    });
  }
}

/** Local JSON-lines file, for development without a database. */
class FileLeadStore implements LeadStore {
  readonly kind = "file" as const;
  constructor(private readonly file: string) {}
  async save(lead: StoredLead) {
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(lead)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

/**
 * LEADS_STORE: postgres | file | none.
 * Default: postgres when a database is configured, otherwise the file store in
 * development, otherwise none. With none, the API answers 503 and the form
 * shows an error; it never reports a success it cannot back up.
 */
export function getLeadStore(): LeadStore | null {
  const mode =
    process.env.LEADS_STORE ?? (process.env.DATABASE_URL ? "postgres" : process.env.NODE_ENV === "development" ? "file" : "none");
  if (mode === "postgres") return process.env.DATABASE_URL ? new PostgresLeadStore() : null;
  if (mode === "file") return new FileLeadStore(process.env.LEADS_FILE ?? path.join(process.cwd(), ".data", "leads.jsonl"));
  return null;
}
