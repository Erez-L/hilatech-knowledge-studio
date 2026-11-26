import { readFile } from "node:fs/promises";
import pg from "pg";

export const BASE = process.env.APP_BASE_URL!;
let ipCounter = 10;

/** A browser-like client: keeps cookies, sends Origin, and has its own (trusted-proxy) client address. */
export class Client {
  private cookies = new Map<string, string>();
  // Always a valid address: an invalid one would not count as a client address at all.
  readonly ip = ((n: number) => `198.18.${Math.floor(n / 250)}.${(n % 250) + 1}`)(ipCounter++);
  organizationId: string | null = null;

  async request(path: string, init: RequestInit & { origin?: string | null; json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const origin = init.origin === undefined ? BASE : init.origin;
    if (origin) headers.set("origin", origin);
    // The server trusts one proxy hop; the first entry is what a client could forge.
    headers.set("x-forwarded-for", `198.51.100.250, ${this.ip}`);
    if (this.organizationId) headers.set("x-hks-organization", this.organizationId);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(init.json);
    }
    const response = await fetch(BASE + path, { ...init, headers, body, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index);
      const value = pair!.slice(index + 1);
      if (!value || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  get = (path: string) => this.request(path);
  post = (path: string, json?: unknown) => this.request(path, { method: "POST", json: json ?? {} });
  async getJson<T = any>(path: string): Promise<T> {
    return (await this.get(path)).json() as Promise<T>;
  }
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  rawCookies() {
    return new Map(this.cookies);
  }
  clearCookies() {
    this.cookies.clear();
  }
  setCookies(cookies: Map<string, string>) {
    this.cookies = new Map(cookies);
  }

  async upload(filename: string, bytes: Uint8Array) {
    const form = new FormData();
    form.append("file", new File([bytes as unknown as BlobPart], filename));
    return this.request("/api/v1/documents", { method: "POST", body: form });
  }

  /** Posts a question and collects the Server-Sent Events. */
  async ask(question: string, extra: { conversationId?: string; locale?: string } = {}) {
    const response = await this.post("/api/v1/chat", { question, locale: extra.locale ?? "en", conversationId: extra.conversationId });
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      return { response, events: [] as any[], text: "" };
    }
    const raw = await response.text();
    const events = raw.split("\n\n").filter((block) => block.startsWith("data: ")).map((block) => JSON.parse(block.slice(6)));
    return { response, events, text: events.filter((e) => e.type === "text").map((e) => e.text).join("") };
  }
}

export const PASSWORD = "correct horse battery staple 42";
let userCounter = 0;

/** Messages written by the development mail outbox (nothing is ever sent). */
export async function outbox(): Promise<{ to: string; kind: string; subject: string; text: string }[]> {
  const raw = await readFile(process.env.MAIL_OUTBOX_FILE!, "utf8").catch(() => "");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
export async function lastLink(to: string, kind: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const message = (await outbox()).filter((m) => m.to === to && m.kind === kind).at(-1);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (link) return link;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no ${kind} message for ${to}`);
}

/**
 * Step one of sign-up (server/registration.ts): the form is posted and a confirmation link is
 * mailed. No account exists yet. The server answers 202 for any valid form.
 */
export const startSignUp = (client: Client, form: { name: string; email: string; password?: string; locale?: "en" | "he" }) =>
  client.post("/api/v1/auth/register", { name: form.name, email: form.email, password: form.password ?? PASSWORD, locale: form.locale ?? "en" });

/** The one-time token inside the confirmation link that was mailed to an address. */
export async function signUpToken(email: string): Promise<string> {
  const token = new URL(await lastLink(email, "verify_email")).searchParams.get("token");
  if (!token) throw new Error(`the confirmation link for ${email} has no token`);
  return token;
}

/** Step two of sign-up: what the confirmation page does when its button is pressed. Creates the account. */
export const confirmSignUp = async (client: Client, email: string) => client.post("/api/v1/auth/verify", { token: await signUpToken(email) });

/** Registers a user, confirms the address, and returns a signed-in client. */
export async function register(name = "user", locale: "en" | "he" = "en") {
  const client = new Client();
  const email = `${name}-${Date.now()}-${userCounter++}@example.test`;
  const signUp = await startSignUp(client, { name, email, locale });
  if (signUp.status !== 202) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`);
  const verified = await confirmSignUp(client, email);
  if (verified.status !== 201) throw new Error(`confirmation failed: ${verified.status} ${await verified.text()}`);
  const signIn = await client.post("/api/auth/sign-in/email", { email, password: PASSWORD });
  if (!signIn.ok) throw new Error(`sign-in failed: ${signIn.status} ${await signIn.text()}`);
  const me = await client.getJson("/api/v1/me");
  return { client, email, me, userId: me.user.id as string, organizationId: me.organization.id as string };
}

export async function waitForDocument(client: Client, id: string, timeoutMs = 25_000) {
  const started = Date.now();
  for (;;) {
    const body = await client.getJson(`/api/v1/documents/${id}`);
    if (["ready", "failed", "unsupported"].includes(body.document?.status)) return body.document;
    if (Date.now() - started > timeoutMs) throw new Error(`document still ${body.document?.status}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Owner-role connection, for assertions and for arranging states the API cannot (expired sessions, disabled users). */
export async function ownerQuery<T extends pg.QueryResultRow = any>(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}
