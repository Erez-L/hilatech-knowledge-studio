import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkHealth, heartbeatIsFresh, startHeartbeat } from "../src/health";

const never = () => new Promise<never>(() => {});

describe("checkHealth", () => {
  it("reports ok only when every probe answers", async () => {
    expect(await checkHealth({ database: async () => ({ rows: [] }), redis: async () => "PONG" })).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });
    expect(await checkHealth({})).toEqual({ status: "ok", checks: {} });
  });

  it("marks the probe that failed and says nothing about why", async () => {
    const report = await checkHealth({
      database: async () => {
        throw new Error("password authentication failed for user hks_app at 10.0.0.5");
      },
      redis: async () => "PONG",
    });
    expect(report).toEqual({ status: "unavailable", checks: { database: "failed", redis: "ok" } });
    expect(JSON.stringify(report)).not.toContain("hks_app");
  });

  it("treats a probe that does not answer in time, or throws at once, as failed", async () => {
    const started = Date.now();
    const report = await checkHealth(
      {
        database: never,
        redis: () => {
          throw new Error("not connected");
        },
        other: async () => 1,
      },
      50,
    );
    expect(report).toEqual({ status: "unavailable", checks: { database: "failed", redis: "failed", other: "ok" } });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("worker heartbeat", () => {
  const dirs: string[] = [];
  const tempFile = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hks-heartbeat-"));
    dirs.push(dir);
    return path.join(dir, "nested", "heartbeat");
  };
  afterAll(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes the file while the process is alive, and the file then counts as fresh", async () => {
    const file = await tempFile();
    expect(await heartbeatIsFresh(file, 90_000)).toBe(false); // no file yet
    const heartbeat = startHeartbeat({ file, alive: () => true, intervalMs: 60_000 });
    try {
      expect(await heartbeat.beat()).toBe(true);
      expect(Number.isNaN(Date.parse((await readFile(file, "utf8")).trim()))).toBe(false);
      expect(await heartbeatIsFresh(file, 90_000)).toBe(true);
      // The same file, two minutes later, is stale.
      expect(await heartbeatIsFresh(file, 90_000, Date.now() + 120_000)).toBe(false);
    } finally {
      heartbeat.stop();
    }
  });

  it("stops refreshing the file when the liveness check fails, hangs or throws", async () => {
    for (const alive of [() => false, never, async () => { throw new Error("redis gone"); }]) {
      const file = await tempFile();
      const first = startHeartbeat({ file, alive: () => true, intervalMs: 60_000 });
      await first.beat();
      first.stop();
      const old = new Date(Date.now() - 300_000);
      await utimes(file, old, old);

      const heartbeat = startHeartbeat({ file, alive, intervalMs: 60_000, timeoutMs: 50 });
      try {
        expect(await heartbeat.beat()).toBe(false);
        expect(await heartbeatIsFresh(file, 90_000)).toBe(false);
      } finally {
        heartbeat.stop();
      }
    }
  });
});
