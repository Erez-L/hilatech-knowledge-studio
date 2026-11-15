import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ContactLead } from "./contact";

/**
 * Where demo requests are delivered. The functional milestone adds a
 * PostgreSQL store (`contact_leads`); until then the only real mechanism is
 * the local file store used in development.
 */
export interface LeadStore {
  save(lead: Omit<ContactLead, "website"> & { receivedAt: string; requestId: string }): Promise<void>;
}

class FileLeadStore implements LeadStore {
  constructor(private readonly file: string) {}
  async save(lead: Parameters<LeadStore["save"]>[0]) {
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(lead)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

/** Returns null when no delivery mechanism is configured — the API then says so. */
export function getLeadStore(): LeadStore | null {
  const mode = process.env.LEADS_STORE ?? (process.env.NODE_ENV === "development" ? "file" : "none");
  if (mode === "file") {
    return new FileLeadStore(process.env.LEADS_FILE ?? path.join(process.cwd(), ".data", "leads.jsonl"));
  }
  return null;
}
