/**
 * LIVE TEST - writes, reads and deletes ONE small object in an existing Amazon S3 bucket.
 * Skipped unless LIVE_S3=1. It never creates or deletes a bucket: the owner creates
 * the bucket named by S3_BUCKET beforehand. See docs/REAL_PROVIDER_VERIFICATION.md, step 7.
 */
import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { newStorageKey, S3Storage } from "../../packages/core/src/index.ts";
import { liveGate, liveSuite, Observations, optionalEnv, requiredEnv } from "./helpers.ts";

const gate = liveGate(
  "Amazon S3 storage adapter",
  "LIVE_S3",
  ["S3_BUCKET", "S3_REGION|AWS_REGION"],
  "The bucket must already exist; AWS credentials from the default chain.",
);

liveSuite(gate, () => {
  const observations = new Observations("s3-storage");
  const bucket = requiredEnv("S3_BUCKET");
  const region = optionalEnv("S3_REGION") ?? requiredEnv("AWS_REGION");
  const endpoint = optionalEnv("S3_ENDPOINT");
  const forcePathStyle = ["1", "true"].includes(optionalEnv("S3_FORCE_PATH_STYLE") ?? "");
  const storage = new S3Storage({ bucket, region, endpoint, forcePathStyle });

  // The key shape the application uses: org/<organization uuid>/doc/<random uuid>.
  const key = newStorageKey(randomUUID());
  const payload = new TextEncoder().encode(`hks live verification object ${randomUUID()}\n`);
  let written = false;

  afterAll(async () => {
    // Remove the object even when a test failed part-way.
    if (written) await storage.delete(key).catch(() => console.warn("[live:s3-storage] cleanup failed: delete the object under org/ by hand"));
    await observations.write();
  });

  /** The plain HTTPS address of the object, with no signature. */
  const anonymousUrl = () => {
    if (endpoint) return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
    // Bucket names containing dots do not match the wildcard TLS certificate, so use path style for them.
    return bucket.includes(".") || forcePathStyle
      ? `https://s3.${region}.amazonaws.com/${bucket}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  };

  it("uses the application's key shape", () => {
    expect(key).toMatch(/^org\/[0-9a-f-]{36}\/doc\/[0-9a-f-]{36}$/);
  });

  it("reports a key that was never written as absent", async () => {
    expect(await storage.exists(key)).toBe(false);
  });

  it("round-trips an object: put, exists, get", async () => {
    await storage.put(key, payload, "text/plain");
    written = true;
    expect(await storage.exists(key)).toBe(true);
    const read = await storage.get(key);
    expect(Buffer.from(read).equals(Buffer.from(payload))).toBe(true);
  });

  it("denies an unauthenticated HTTPS GET of the object", async () => {
    expect(written).toBe(true);
    const response = await fetch(anonymousUrl(), { redirect: "manual" });
    const body = await response.text();
    observations.record("anonymousGet.status", response.status);
    observations.record("anonymousGet.errorCode", /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? null);
    // The object's content must not be served, whatever the status.
    expect(body).not.toContain("hks live verification object");
    expect(response.status).toBe(403);
  });

  it("deletes the object, after which it is absent", async () => {
    await storage.delete(key);
    written = false;
    expect(await storage.exists(key)).toBe(false);

    // What `get` reports for a missing key depends on IAM: with s3:ListBucket the service answers
    // 404 NoSuchKey (mapped to not_found); without it, 403 AccessDenied. Record which one this role gets.
    const outcome = await storage.get(key).then(
      () => "returned data",
      (error: { code?: string; name?: string }) => (error.code === "not_found" ? "not_found" : `other error: ${error.name ?? "unknown"}`),
    );
    observations.record("getAfterDelete", outcome);
    expect(outcome).not.toBe("returned data");
    observations.soft(
      "reading a missing key maps to not_found (requires s3:ListBucket on the bucket; otherwise S3 answers 403)",
      outcome === "not_found",
      { outcome },
    );
  });
});
