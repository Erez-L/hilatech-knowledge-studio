import { describe, expect, it } from "vitest";
import { S3Storage } from "../src/index.ts";

/** S3 error handling with STUBBED SDK responses. Nothing here talks to AWS. */
const KEY = "org/11111111-1111-4111-8111-111111111111/doc/22222222-2222-4222-8222-222222222222";
const sdkError = (name: string, httpStatusCode?: number) => Object.assign(new Error(`${name} for ${KEY}`), { name, $metadata: { httpStatusCode } });
const storageThat = (respond: (command: string) => unknown) => {
  const commands: string[] = [];
  const storage = new S3Storage({
    bucket: "test-bucket",
    region: "us-east-1",
    client: {
      send: async (command: never) => {
        const name = (command as { constructor: { name: string } }).constructor.name;
        commands.push(name);
        const result = respond(name);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
  return { storage, commands };
};
const failure = async (work: Promise<unknown>) => work.then(() => null, (error: { code?: string; message: string; detail?: string }) => error);

describe("S3 storage error handling (stubbed SDK)", () => {
  it("exists() is false only when S3 says the object is absent", async () => {
    expect(await storageThat(() => ({})).storage.exists(KEY)).toBe(true);
    expect(await storageThat(() => sdkError("NotFound", 404)).storage.exists(KEY)).toBe(false);
    expect(await storageThat(() => sdkError("UnknownError", 404)).storage.exists(KEY)).toBe(false); // HeadObject has no error body
  });

  it.each([
    ["AccessDenied", 403, /access was denied or the credentials are invalid/],
    ["Forbidden", 403, /access was denied/], // HeadObject without s3:ListBucket on a key that may or may not exist
    ["InvalidAccessKeyId", 403, /credentials are invalid/],
    ["SignatureDoesNotMatch", 403, /credentials are invalid/],
    ["ExpiredToken", 400, /credentials are invalid/],
    ["CredentialsProviderError", undefined, /credentials are invalid/],
    ["PermanentRedirect", 301, /different Region/],
    ["NoSuchBucket", 404, /bucket does not exist/],
    ["TimeoutError", undefined, /could not be reached/],
    ["InternalError", 500, /returned an error/],
  ])("exists(), get() and delete() report %s as an actionable error, never as a missing object", async (name, status, hint) => {
    for (const run of [(s: S3Storage) => s.exists(KEY), (s: S3Storage) => s.get(KEY), (s: S3Storage) => s.delete(KEY), (s: S3Storage) => s.put(KEY, new Uint8Array([1]), "text/plain")]) {
      const error = await failure(run(storageThat(() => sdkError(name, status)).storage));
      expect(error, name).not.toBeNull();
      expect(error!.code).toBe("internal");
      expect(`${error!.message} ${error!.detail ?? ""}`).toMatch(hint);
      expect(`${error!.message} ${error!.detail ?? ""}`).not.toContain(KEY); // tenant ids stay out of error text
    }
  });

  it("get() maps a definite NoSuchKey to not_found, and a 403 to an access error", async () => {
    expect((await failure(storageThat(() => sdkError("NoSuchKey", 404)).storage.get(KEY)))!.code).toBe("not_found");
    expect((await failure(storageThat(() => sdkError("AccessDenied", 403)).storage.get(KEY)))!.code).toBe("internal");
  });

  it("delete() succeeds when the object is already gone and sends one request", async () => {
    const gone = storageThat(() => sdkError("NoSuchKey", 404));
    await expect(gone.storage.delete(KEY)).resolves.toBeUndefined();
    const ok = storageThat(() => ({}));
    await ok.storage.delete(KEY);
    expect(ok.commands).toEqual(["DeleteObjectCommand"]);
  });

  it("refuses keys outside the tenant layout before any request is made", async () => {
    const { storage, commands } = storageThat(() => ({}));
    for (const key of ["../etc/passwd", "org/x/doc/y", "other/11111111-1111-4111-8111-111111111111"]) {
      expect(await failure(storage.exists(key))).not.toBeNull();
    }
    expect(commands).toEqual([]);
  });
});
