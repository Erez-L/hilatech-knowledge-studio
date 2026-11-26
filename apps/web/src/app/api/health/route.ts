import { NextResponse } from "next/server";
import { checkHealth, type HealthReport } from "@hks/core";
import { backendConfigured, getServices } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The endpoint needs no sign-in, so one probe result is reused for a few seconds: a flood of
// requests cannot turn into a flood of database queries.
const REUSE_MS = 3000;
let last: { at: number; report: HealthReport } | undefined;

/**
 * Is this server able to do its work? 200 when PostgreSQL and Redis both answer, 503 otherwise.
 * The body names the checks and nothing else. Used by the container health check and by
 * outside uptime monitoring. A deployment without a backend (the scripted preview) reports ok
 * with no checks.
 */
export async function GET() {
  let report: HealthReport;
  if (!backendConfigured()) {
    report = { status: "ok", checks: {} };
  } else if (last && Date.now() - last.at < REUSE_MS) {
    report = last.report;
  } else {
    try {
      const { database, pingRedis } = getServices();
      report = await checkHealth({ database: () => database.pool.query("select 1"), redis: pingRedis });
    } catch {
      report = { status: "unavailable", checks: { configuration: "failed" } };
    }
    last = { at: Date.now(), report };
  }
  return NextResponse.json(report, { status: report.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
