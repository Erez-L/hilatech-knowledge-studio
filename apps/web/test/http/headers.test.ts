import { describe, expect, it } from "vitest";
import { BASE, Client } from "./client.ts";

/** Headers and limits of the production build (see scripts/http-tests.sh). */

describe("security headers", () => {
  it("are sent with pages: no framing, scripts only from this origin", async () => {
    const response = await fetch(`${BASE}/en`, { redirect: "manual" });
    expect(response.status).toBe(200);
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("unsafe-eval");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    // The page still carries the inline scripts Next.js needs, which the policy allows.
    expect(await response.text()).toMatch(/<script>[^<]*__next_f/);
  });

  it("leave API responses to their own headers", async () => {
    const response = await fetch(`${BASE}/api/health`);
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});

describe("request body limit", () => {
  it("refuses an oversized body by its declared length, before the route reads it", async () => {
    const client = new Client();
    const response = await client.request("/api/v1/demo/chat", { method: "POST", body: "x".repeat(70 * 1024), headers: { "content-type": "application/json" } });
    expect(response.status).toBe(413);
  });
});
