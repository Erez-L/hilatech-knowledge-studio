import { describe, expect, it } from "vitest";
import { parseConfig } from "@hks/shared";
import { contentSecurityPolicy, PAGE_HEADERS_SOURCE, securityHeaders } from "../../src/lib/security-headers";
import { readTextBody } from "../../src/server/body";
import nextConfig from "../../next.config";

const directives = (policy: string) =>
  new Map(policy.split(";").map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name!, values]));

describe("page security headers", () => {
  it("forbid framing and plugins, and allow scripts and connections only from this origin", () => {
    const policy = directives(contentSecurityPolicy({ development: false }));
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    // Next.js streams page data in inline scripts; nothing else, and no eval, in production.
    expect(policy.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    // No other host anywhere in the policy.
    expect(contentSecurityPolicy({ development: false })).not.toMatch(/https?:|\*/);
  });

  it("add only what the development server needs in development", () => {
    const policy = directives(contentSecurityPolicy({ development: true }));
    expect(policy.get("script-src")).toContain("'unsafe-eval'");
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("are sent with every page but not the API, through next.config", async () => {
    const headers = await nextConfig.headers!();
    expect(headers).toHaveLength(1);
    expect(headers[0]!.source).toBe(PAGE_HEADERS_SOURCE);
    const source = new RegExp(`^${PAGE_HEADERS_SOURCE.replace("/(", "/(?:")}$`);
    expect(source.test("/he/app")).toBe(true);
    expect(source.test("/")).toBe(true);
    expect(source.test("/api/v1/documents")).toBe(false);
    const names = headers[0]!.headers.map((header) => header.key);
    expect(names).toEqual(expect.arrayContaining(["Content-Security-Policy", "X-Frame-Options", "Permissions-Policy", "X-Content-Type-Options"]));
    expect(securityHeaders({ development: false }).find((h) => h.key === "X-Frame-Options")!.value).toBe("DENY");
  });
});

describe("request body limit", () => {
  const request = (body: BodyInit | null, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
  const codeOf = (promise: Promise<unknown>) => promise.then(() => "no error", (error) => (error as { code?: string }).code);

  it("reads a body within the limit", async () => {
    expect(await readTextBody(request(JSON.stringify({ question: "שלום" })), 1024)).toBe('{"question":"שלום"}');
  });

  it("refuses by the declared length before reading anything", async () => {
    expect(await codeOf(readTextBody(request("x", { "content-length": "999999" }), 1024))).toBe("payload_too_large");
  });

  it("refuses a body that turns out longer than the limit while it is read", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(512));
        controller.close();
      },
    });
    expect(await codeOf(readTextBody(request(stream), 1024))).toBe("payload_too_large");
  });
});

describe("checks for deployed environments", () => {
  it("apply to the public demo deployment (APP_ENV=demo) as to production", () => {
    for (const APP_ENV of ["demo", "production"]) {
      expect(() => parseConfig({ APP_ENV, LLM_PROVIDER: "deterministic", EMBEDDINGS_PROVIDER: "deterministic", SAMPLE_MODE: "true" })).toThrow(/test doubles/);
      expect(() => parseConfig({ APP_ENV, MAIL_TRANSPORT: "file" })).toThrow(/development outbox/);
    }
    expect(() => parseConfig({ APP_ENV: "development", MAIL_TRANSPORT: "file" })).not.toThrow();
  });
});
