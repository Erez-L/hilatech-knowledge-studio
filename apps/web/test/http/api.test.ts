import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE, Client, lastLink, outbox, ownerQuery, PASSWORD, register, waitForDocument } from "./client.ts";

/**
 * Real HTTP against a running server (see scripts/http-tests.sh).
 * AI providers are DETERMINISTIC TEST DOUBLES here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = (name: string) => readFile(path.join(here, "..", "..", "..", "..", "samples", "northstar", "en", name));

type Registered = Awaited<ReturnType<typeof register>>;
let alice: Registered; // owner of organization A
let bob: Registered; // owner of organization B
let handbookId: string;
let aliceConversationId: string;

beforeAll(async () => {
  alice = await register("alice");
  bob = await register("bob");
  const upload = await alice.client.upload("customer-support-handbook.pdf", await sample("customer-support-handbook.pdf"));
  expect(upload.status).toBe(202);
  handbookId = (await upload.json()).document.id;
  expect((await waitForDocument(alice.client, handbookId)).status).toBe("ready");
});

describe("authentication", () => {
  it("creates the account's own organization and default workspace on sign-up", () => {
    expect(alice.me).toMatchObject({ role: "owner", organization: { kind: "standard" }, pipeline: { mode: "sample", answering: true } });
    expect(alice.organizationId).not.toBe(bob.organizationId);
    expect(alice.me.user.email).toBe(alice.email);
  });

  it("requires email verification before the first sign-in", async () => {
    const client = new Client();
    const email = `unverified-${Date.now()}@example.test`;
    expect((await client.post("/api/auth/sign-up/email", { name: "u", email, password: PASSWORD })).ok).toBe(true);
    expect((await client.get("/api/v1/me")).status).toBe(401);
    const denied = await client.post("/api/auth/sign-in/email", { email, password: PASSWORD });
    expect(denied.status).toBe(403);
    const message = (await outbox()).find((m) => m.to === email)!;
    expect(message).toMatchObject({ kind: "verify_email", subject: "Confirm your email address" });
    await client.get((await lastLink(email, "verify_email")).replace(BASE, ""));
    expect((await client.post("/api/auth/sign-in/email", { email, password: PASSWORD })).ok).toBe(true);
    expect((await client.get("/api/v1/me")).status).toBe(200);
  });

  it("sends Hebrew email to a user who registered in Hebrew", async () => {
    const client = new Client();
    const email = `he-${Date.now()}@example.test`;
    await client.post("/api/auth/sign-up/email", { name: "דנה", email, password: PASSWORD, locale: "he" });
    await lastLink(email, "verify_email");
    expect((await outbox()).find((m) => m.to === email)!.subject).toBe("אישור כתובת האימייל שלך");
  });

  it("rejects weak passwords and does not reveal whether an email is registered", async () => {
    const client = new Client();
    const weak = await client.post("/api/auth/sign-up/email", { name: "w", email: `weak-${Date.now()}@example.test`, password: "short" });
    expect(weak.status).toBe(400);
    const wrongPassword = await client.post("/api/auth/sign-in/email", { email: alice.email, password: "definitely wrong password" });
    const unknownUser = await client.post("/api/auth/sign-in/email", { email: `nobody-${Date.now()}@example.test`, password: "definitely wrong password" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect((await wrongPassword.json()).code).toBe((await unknownUser.json()).code);
    // Registering an existing address answers like a new one and creates nothing.
    const before = (await ownerQuery("select count(*)::int as n from users where email = $1", [alice.email]))[0].n;
    const again = await new Client().post("/api/auth/sign-up/email", { name: "x", email: alice.email, password: PASSWORD });
    expect(again.status).toBe(200);
    expect((await ownerQuery("select count(*)::int as n from users where email = $1", [alice.email]))[0].n).toBe(before);
  });

  it("stores passwords only as hashes, in the auth library's table", async () => {
    const rows = await ownerQuery(
      "select a.password, u.password_hash from accounts a join users u on u.id = a.user_id where u.email = $1 and a.provider_id = 'credential'",
      [alice.email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].password).not.toContain(PASSWORD);
    expect(rows[0].password.length).toBeGreaterThan(40);
    expect(rows[0].password_hash).toBeNull();
  });

  it("sets an HttpOnly, SameSite session cookie", async () => {
    const client = new Client();
    const response = await client.post("/api/auth/sign-in/email", { email: alice.email, password: PASSWORD });
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it("rate-limits repeated sign-in attempts per client address", async () => {
    const attacker = new Client();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await attacker.post("/api/auth/sign-in/email", { email: alice.email, password: `guess number ${i} wrong` })).status);
    }
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // A different address is unaffected.
    expect((await new Client().post("/api/auth/sign-in/email", { email: alice.email, password: PASSWORD })).status).toBe(200);
  });

  it("signs out, and a revoked or expired session stops working", async () => {
    const session = await register("carol");
    const saved = session.client.rawCookies();
    expect((await session.client.post("/api/auth/sign-out")).ok).toBe(true);
    expect((await session.client.get("/api/v1/me")).status).toBe(401);
    // Replaying the old cookie after sign-out fails: the session row is gone.
    session.client.setCookies(saved);
    expect((await session.client.get("/api/v1/me")).status).toBe(401);

    // Two devices; one revokes all sessions.
    const laptop = new Client();
    const phone = new Client();
    await laptop.post("/api/auth/sign-in/email", { email: session.email, password: PASSWORD });
    await phone.post("/api/auth/sign-in/email", { email: session.email, password: PASSWORD });
    expect((await phone.get("/api/v1/me")).status).toBe(200);
    expect((await laptop.post("/api/auth/revoke-other-sessions")).ok).toBe(true);
    expect((await phone.get("/api/v1/me")).status).toBe(401);
    expect((await laptop.get("/api/v1/me")).status).toBe(200);

    // Expiry is enforced on the server.
    await ownerQuery("update sessions set expires_at = now() - interval '1 minute' where user_id = $1", [session.userId]);
    expect((await laptop.get("/api/v1/me")).status).toBe(401);
  });

  it("resets a password by emailed link and revokes existing sessions", async () => {
    const user = await register("dave");
    const anonymous = new Client();
    expect((await anonymous.post("/api/auth/request-password-reset", { email: user.email, redirectTo: "/en/reset-password" })).ok).toBe(true);
    // Unknown addresses get the same answer and no email.
    const unknown = `ghost-${Date.now()}@example.test`;
    expect((await anonymous.post("/api/auth/request-password-reset", { email: unknown, redirectTo: "/en/reset-password" })).ok).toBe(true);
    expect((await outbox()).some((m) => m.to === unknown)).toBe(false);

    const link = await lastLink(user.email, "reset_password");
    const token = new URL(link).pathname.split("/").pop()!;
    const newPassword = "an entirely new passphrase 77";
    expect((await anonymous.post("/api/auth/reset-password", { token, newPassword })).ok).toBe(true);
    expect((await user.client.get("/api/v1/me")).status).toBe(401); // old session revoked
    expect((await new Client().post("/api/auth/sign-in/email", { email: user.email, password: PASSWORD })).status).toBe(401);
    expect((await new Client().post("/api/auth/sign-in/email", { email: user.email, password: newPassword })).status).toBe(200);
    // The token cannot be used twice.
    expect((await anonymous.post("/api/auth/reset-password", { token, newPassword: "yet another passphrase 88" })).ok).toBe(false);
  });

  it("refuses sign-in for a disabled account", async () => {
    const user = await register("erin");
    await ownerQuery("update users set disabled_at = now() where id = $1", [user.userId]);
    const response = await new Client().post("/api/auth/sign-in/email", { email: user.email, password: PASSWORD });
    expect(response.ok).toBe(false);
  });
});

describe("every API endpoint requires a session", () => {
  const id = "00000000-0000-4000-8000-000000000000";
  const cases: [string, string][] = [
    ["GET", "/api/v1/me"], ["GET", "/api/v1/documents"], ["POST", "/api/v1/documents"], ["GET", `/api/v1/documents/${id}`],
    ["DELETE", `/api/v1/documents/${id}`], ["GET", `/api/v1/documents/${id}/file`], ["GET", `/api/v1/documents/${id}/content`],
    ["POST", `/api/v1/documents/${id}/retry`], ["GET", "/api/v1/conversations"], ["GET", `/api/v1/conversations/${id}`],
    ["DELETE", `/api/v1/conversations/${id}`], ["POST", "/api/v1/chat"], ["GET", "/api/v1/usage"], ["GET", "/api/v1/members"],
    ["POST", "/api/v1/members"], ["PATCH", `/api/v1/members/${id}`], ["DELETE", `/api/v1/members/${id}`],
  ];
  it.each(cases)("%s %s → 401", async (method, url) => {
    const response = await new Client().request(url, { method, json: method === "GET" ? undefined : {} });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({ code: "unauthenticated" });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("cross-site request protection", () => {
  it("refuses state-changing requests without our Origin", async () => {
    const noOrigin = await alice.client.request("/api/v1/chat", { method: "POST", json: { question: "x", locale: "en" }, origin: null });
    expect(noOrigin.status).toBe(403);
    const foreign = await alice.client.request(`/api/v1/documents/${handbookId}`, { method: "DELETE", origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
    expect((await alice.client.getJson(`/api/v1/documents/${handbookId}`)).document.status).toBe("ready");
  });
});

describe("documents", () => {
  it("lists, searches and describes documents without exposing storage details", async () => {
    const list = await alice.client.getJson("/api/v1/documents");
    expect(list.documents).toHaveLength(1);
    const doc = list.documents[0];
    expect(doc).toMatchObject({ id: handbookId, title: "Customer support handbook", fileType: "pdf", status: "ready", pageCount: 12, language: "en" });
    expect(JSON.stringify(doc)).not.toMatch(/storageKey|storage_key|sha256|org\//);
    expect((await alice.client.getJson("/api/v1/documents?q=HANDBOOK")).documents).toHaveLength(1);
    expect((await alice.client.getJson("/api/v1/documents?q=nothing-like-this")).documents).toHaveLength(0);
  });

  it("serves extracted text by page", async () => {
    const page = await alice.client.getJson(`/api/v1/documents/${handbookId}/content?page=7`);
    expect(page.document.pageCount).toBe(12);
    expect(page.chunks.length).toBeGreaterThan(0);
    expect(page.chunks.map((c: any) => c.text).join(" ")).toContain("first response within 30 minutes");
    expect(page.chunks.every((c: any) => c.pageNumber === 7)).toBe(true);
    expect((await alice.client.get(`/api/v1/documents/${handbookId}/content?page=0`)).status).toBe(422);
  });

  it("downloads the original file with safe headers", async () => {
    const response = await alice.client.get(`/api/v1/documents/${handbookId}/file`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("content-disposition")).toMatch(/^inline; filename="document\.pdf"/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBe((await sample("customer-support-handbook.pdf")).byteLength);
  });

  it("validates uploads on the server", async () => {
    const tooBig = await alice.client.upload("big.txt", new Uint8Array(2 * 1024 * 1024 + 70 * 1024).fill(65));
    expect(tooBig.status).toBe(413);
    const disguised = await alice.client.upload("report.pdf", new TextEncoder().encode("this is not a pdf"));
    expect(disguised.status).toBe(415);
    const executable = await alice.client.upload("tool.exe", new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]));
    expect(executable.status).toBe(415);
    const noFile = await alice.client.request("/api/v1/documents", { method: "POST", body: new FormData() });
    expect(noFile.status).toBe(422);
    const traversal = await alice.client.upload("../../etc/passwd.txt", new TextEncoder().encode("A harmless note about parking permits."));
    expect(traversal.status).toBe(202);
    const stored = (await traversal.json()).document;
    expect(stored.filename).toBe("passwd.txt");
    expect(stored.title).toBe("Passwd");
    await waitForDocument(alice.client, stored.id);
    expect((await alice.client.request(`/api/v1/documents/${stored.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("reports a damaged file as failed and lets the uploader retry", async () => {
    const upload = await alice.client.upload("damaged.pdf", (await sample("customer-support-handbook.pdf")).subarray(0, 900));
    const { document } = await upload.json();
    const failed = await waitForDocument(alice.client, document.id);
    expect(failed).toMatchObject({ status: "failed", failureCode: "malformed_file" });
    expect((await alice.client.post(`/api/v1/documents/${document.id}/retry`)).status).toBe(202);
    expect((await waitForDocument(alice.client, document.id)).status).toBe("failed");
    await alice.client.request(`/api/v1/documents/${document.id}`, { method: "DELETE" });
  });
});

describe("chat", () => {
  it("streams a grounded answer with citations and saves the conversation", async () => {
    const { response, events, text } = await alice.client.ask("Priority 1 tickets receive a first response within how many minutes during business hours?");
    expect(response.status).toBe(200);
    expect(events[0]).toMatchObject({ type: "start", pipelineMode: "sample" });
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", status: "complete", answerStatus: "answered" });
    expect(done.sources[0]).toMatchObject({ label: "S1", documentId: handbookId, pageNumber: 7 });
    expect(events.filter((e) => e.type === "citation").map((e) => e.source.label)).toEqual(done.sources.map((s: any) => s.label));
    expect(text.length).toBeGreaterThan(20);
    aliceConversationId = events[0].conversationId;

    const list = await alice.client.getJson("/api/v1/conversations");
    expect(list.conversations[0]).toMatchObject({ id: aliceConversationId });
    const thread = await alice.client.getJson(`/api/v1/conversations/${aliceConversationId}`);
    expect(thread.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(thread.messages[1]).toMatchObject({ pipelineMode: "sample", answerStatus: "answered" });
    expect(thread.messages[1].citations[0]).toMatchObject({ label: "S1", documentId: handbookId, pageNumber: 7, sourceState: "available" });

    const usage = await alice.client.getJson("/api/v1/usage");
    expect(usage.today.questions).toBeGreaterThanOrEqual(1);
    expect(usage.today).toMatchObject({ inputTokens: 0, outputTokens: 0 }); // test doubles are not spend
  });

  it("answers 'not enough evidence' with no citations", async () => {
    const { events, text } = await alice.client.ask("Zebra quantum xylophone marmalade?");
    expect(events.at(-1)).toMatchObject({ type: "done", answerStatus: "insufficient_evidence", sources: [] });
    expect(text).toBe("");
  });

  it("validates the request body", async () => {
    expect((await alice.client.post("/api/v1/chat", { question: "", locale: "en" })).status).toBe(422);
    expect((await alice.client.post("/api/v1/chat", { question: "x".repeat(2001), locale: "en" })).status).toBe(422);
    expect((await alice.client.post("/api/v1/chat", { question: "ok", locale: "fr" })).status).toBe(422);
    expect((await alice.client.request("/api/v1/chat", { method: "POST", body: "{not json", headers: { "content-type": "application/json" } })).status).toBe(400);
  });
});

describe("tenant isolation over HTTP", () => {
  it("another organization cannot see, read, download, retry or delete a document by id", async () => {
    expect((await bob.client.getJson("/api/v1/documents")).documents).toEqual([]);
    for (const [method, url] of [
      ["GET", `/api/v1/documents/${handbookId}`],
      ["GET", `/api/v1/documents/${handbookId}/file`],
      ["GET", `/api/v1/documents/${handbookId}/content`],
      ["GET", `/api/v1/documents/${handbookId}/content?page=7`],
      ["POST", `/api/v1/documents/${handbookId}/retry`],
      ["DELETE", `/api/v1/documents/${handbookId}`],
    ] as const) {
      const response = await bob.client.request(url, { method, json: method === "GET" ? undefined : {} });
      expect(response.status, `${method} ${url}`).toBe(404);
    }
    expect((await alice.client.getJson(`/api/v1/documents/${handbookId}`)).document.status).toBe("ready");
  });

  it("naming another organization in the header, query or body changes nothing", async () => {
    bob.client.organizationId = alice.organizationId; // not a member
    const me = await bob.client.getJson("/api/v1/me");
    expect(me.organization.id).toBe(bob.organizationId);
    expect((await bob.client.getJson("/api/v1/documents")).documents).toEqual([]);
    expect((await bob.client.getJson(`/api/v1/documents?organizationId=${alice.organizationId}&workspaceId=x`)).documents).toEqual([]);
    expect((await bob.client.get(`/api/v1/documents/${handbookId}/file`)).status).toBe(404);
    const smuggled = await bob.client.post("/api/v1/chat", {
      question: "Priority 1 tickets receive a first response within how many minutes?", locale: "en",
      organizationId: alice.organizationId, workspaceId: alice.me.organization.id,
    });
    const raw = await smuggled.text();
    expect(raw).not.toContain("30 minutes");
    expect(raw).not.toContain(handbookId);
    bob.client.organizationId = null;
  });

  it("vector search never returns another organization's passages", async () => {
    const { events, text } = await bob.client.ask("Priority 1 tickets receive a first response within how many minutes during business hours?");
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", answerStatus: "insufficient_evidence", sources: [] });
    expect(text).toBe("");
    expect(JSON.stringify(events)).not.toContain(handbookId);
  });

  it("another organization cannot read, continue or delete a conversation", async () => {
    expect((await bob.client.get(`/api/v1/conversations/${aliceConversationId}`)).status).toBe(404);
    expect((await bob.client.request(`/api/v1/conversations/${aliceConversationId}`, { method: "DELETE" })).status).toBe(404);
    const { events } = await bob.client.ask("follow up", { conversationId: aliceConversationId });
    expect(events).toEqual([{ type: "error", code: "not_found", messageId: null }]);
    expect((await alice.client.getJson(`/api/v1/conversations/${aliceConversationId}`)).messages).toHaveLength(2);
  });

  it("another organization cannot list or change members", async () => {
    const members = await bob.client.getJson("/api/v1/members");
    expect(members.members.map((m: any) => m.userId)).toEqual([bob.userId]);
    expect((await bob.client.request(`/api/v1/members/${alice.userId}`, { method: "PATCH", json: { role: "member" } })).status).toBe(404);
    expect((await bob.client.request(`/api/v1/members/${alice.userId}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("roles inside one organization", () => {
  let member: Registered;
  let memberDocId: string;

  beforeAll(async () => {
    member = await register("mallory");
    expect((await alice.client.post("/api/v1/members", { email: member.email, role: "member" })).status).toBe(202);
    member.client.organizationId = alice.organizationId; // now a real membership, so the header is honoured
  });

  it("a member sees the organization's documents and can ask about them", async () => {
    const me = await member.client.getJson("/api/v1/me");
    expect(me).toMatchObject({ role: "member", organization: { id: alice.organizationId }, capabilities: { manageMembers: false, deleteAnyDocument: false } });
    expect((await member.client.getJson("/api/v1/documents")).documents.map((d: any) => d.id)).toContain(handbookId);
    const { events } = await member.client.ask("Priority 1 tickets receive a first response within how many minutes during business hours?");
    expect(events.at(-1).sources[0].documentId).toBe(handbookId);
  });

  it("a member cannot read a colleague's conversation", async () => {
    expect((await member.client.get(`/api/v1/conversations/${aliceConversationId}`)).status).toBe(404);
    expect((await member.client.getJson("/api/v1/conversations")).conversations.some((c: any) => c.id === aliceConversationId)).toBe(false);
  });

  it("a member can delete their own upload but not someone else's", async () => {
    const upload = await member.client.upload("member-notes.txt", new TextEncoder().encode("The stationery cupboard is restocked every second Monday."));
    memberDocId = (await upload.json()).document.id;
    await waitForDocument(member.client, memberDocId);
    const denied = await member.client.request(`/api/v1/documents/${handbookId}`, { method: "DELETE" });
    expect(denied.status).toBe(403);
    expect((await member.client.request(`/api/v1/documents/${memberDocId}`, { method: "DELETE" })).status).toBe(200);
    const audit = await ownerQuery("select outcome from audit_events where action = 'document.delete' and actor_user_id = $1", [member.userId]);
    expect(audit).toEqual([{ outcome: "denied" }]);
  });

  it("a member cannot manage members; an admin can, but not owners; the last owner stays", async () => {
    expect((await member.client.post("/api/v1/members", { email: bob.email, role: "member" })).status).toBe(403);
    expect((await member.client.request(`/api/v1/members/${alice.userId}`, { method: "PATCH", json: { role: "member" } })).status).toBe(403);

    expect((await alice.client.request(`/api/v1/members/${member.userId}`, { method: "PATCH", json: { role: "admin" } })).status).toBe(200);
    expect((await member.client.getJson("/api/v1/me")).capabilities).toMatchObject({ manageMembers: true, deleteAnyDocument: true });
    expect((await member.client.request(`/api/v1/members/${alice.userId}`, { method: "PATCH", json: { role: "member" } })).status).toBe(403);
    expect((await member.client.request(`/api/v1/members/${alice.userId}`, { method: "DELETE" })).status).toBe(403);
    expect((await member.client.request(`/api/v1/members/${member.userId}`, { method: "PATCH", json: { role: "owner" } })).status).toBe(403);

    expect((await alice.client.request(`/api/v1/members/${alice.userId}`, { method: "PATCH", json: { role: "admin" } })).status).toBe(409);
    expect((await alice.client.request(`/api/v1/members/${alice.userId}`, { method: "DELETE" })).status).toBe(409);
  });

  it("a removed member loses access immediately", async () => {
    expect((await alice.client.request(`/api/v1/members/${member.userId}`, { method: "DELETE" })).status).toBe(200);
    const me = await member.client.getJson("/api/v1/me");
    expect(me.organization.id).toBe(member.organizationId); // back to their own organization
    expect((await member.client.get(`/api/v1/documents/${handbookId}`)).status).toBe(404);
  });
});

describe("limits and leads", () => {
  it("rate-limits questions per user and says when to retry", async () => {
    const user = await register("frank");
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 10; i++) {
      const response = await user.client.post("/api/v1/chat", { question: `question ${i}`, locale: "en" });
      await response.text();
      statuses.push(response.status);
      if (response.status === 429) retryAfter = response.headers.get("retry-after");
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(8);
    expect(statuses.slice(8)).toEqual([429, 429]);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("stores contact leads in PostgreSQL", async () => {
    const email = `lead-${Date.now()}@example.test`;
    const response = await new Client().post("/api/contact", { name: "Dana", email, company: "", message: "We need this.", locale: "he" });
    expect(response.status).toBe(201);
    const rows = await ownerQuery("select name, locale, status, request_id from contact_leads where email = $1", [email]);
    expect(rows).toEqual([{ name: "Dana", locale: "he", status: "new", request_id: response.headers.get("x-request-id") }]);
  });
});

describe("deletion over HTTP", () => {
  it("removes the document everywhere and tombstones the old citation", async () => {
    expect((await alice.client.request(`/api/v1/documents/${handbookId}`, { method: "DELETE" })).status).toBe(200);
    expect((await alice.client.get(`/api/v1/documents/${handbookId}`)).status).toBe(404);
    expect((await alice.client.get(`/api/v1/documents/${handbookId}/file`)).status).toBe(404);
    const { events } = await alice.client.ask("Priority 1 tickets receive a first response within how many minutes during business hours?");
    expect(JSON.stringify(events)).not.toContain(handbookId);
    const thread = await alice.client.getJson(`/api/v1/conversations/${aliceConversationId}`);
    expect(thread.messages[1].citations[0]).toMatchObject({ sourceState: "removed", excerpt: null, documentId: null, documentTitle: "Customer support handbook" });
    const left = await ownerQuery("select (select count(*) from document_chunks where document_id = $1)::int as chunks, (select count(*) from chunk_embeddings where document_id = $1)::int as vectors", [handbookId]);
    expect(left[0]).toEqual({ chunks: 0, vectors: 0 });
  });
});
