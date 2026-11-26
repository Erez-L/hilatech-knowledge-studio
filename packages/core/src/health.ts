import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { log } from "@hks/shared";

export type HealthReport = { status: "ok" | "unavailable"; checks: Record<string, "ok" | "failed"> };

/** Rejects when `work` has not settled within `ms`. */
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error("failed")); },
    );
  });
}

/**
 * Runs every probe side by side, each with its own time limit, and says which ones answered.
 * It never throws, and the report carries names only: no error text, host name or version, so
 * it can be served without sign-in.
 */
export async function checkHealth(probes: Record<string, () => Promise<unknown>>, timeoutMs = 2000): Promise<HealthReport> {
  const names = Object.keys(probes);
  const results = await Promise.all(
    names.map(async (name) => {
      try {
        await within(Promise.resolve().then(probes[name]!), timeoutMs);
        return "ok" as const;
      } catch (error) {
        log("warn", "health.check_failed", { check: name, name: (error as Error).name });
        return "failed" as const;
      }
    }),
  );
  const checks = Object.fromEntries(names.map((name, i) => [name, results[i]!]));
  return { status: results.every((result) => result === "ok") ? "ok" : "unavailable", checks };
}

/**
 * A process without an HTTP port (the worker) shows that it is alive by rewriting a small file
 * while `alive` holds. A container health check then only has to look at the file's age
 * (`heartbeatIsFresh`). When `alive` is false, hangs or throws, the file is left to grow old.
 */
export function startHeartbeat(options: { file: string; alive: () => Promise<boolean> | boolean; intervalMs?: number; timeoutMs?: number }) {
  const file = path.resolve(options.file);
  const intervalMs = options.intervalMs ?? 15_000;
  let lastState: "beating" | "silent" | null = null;
  const beat = async (): Promise<boolean> => {
    let ok = false;
    try {
      ok = (await within(Promise.resolve().then(options.alive), options.timeoutMs ?? 5000)) === true;
      if (ok) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, `${new Date().toISOString()}\n`, { mode: 0o600 });
      }
    } catch {
      ok = false;
    }
    const state = ok ? "beating" : "silent";
    // One line per change of state, not one per beat.
    if (state !== lastState) log(ok ? "info" : "warn", ok ? "heartbeat.beating" : "heartbeat.silent", {});
    lastState = state;
    return ok;
  };
  void beat();
  const timer = setInterval(() => void beat(), intervalMs);
  timer.unref();
  return { beat, stop: () => clearInterval(timer) };
}

/** True when the heartbeat file was written within the last `maxAgeMs`. A missing file is not fresh. */
export async function heartbeatIsFresh(file: string, maxAgeMs: number, now = Date.now()): Promise<boolean> {
  try {
    return now - (await stat(file)).mtimeMs <= maxAgeMs;
  } catch {
    return false;
  }
}
