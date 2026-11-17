import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

/**
 * A sign-up that has not been confirmed yet.
 *
 * Nothing is written to PostgreSQL when someone fills in the sign-up form. The details wait
 * here, in Redis, with a time limit, and the account is created only when the person opens
 * the link sent to their email address. An address that is never confirmed leaves no user,
 * no organization and no row to clean up: the entry simply expires.
 */
export type PendingRegistration = {
  email: string;
  name: string;
  /** Already hashed. The plain password is never stored, not even here. */
  passwordHash: string;
  locale: "en" | "he";
};

export const PENDING_REGISTRATION_TTL_SECONDS = 3600;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class PendingRegistrations {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "hks:signup",
    private readonly ttlSeconds = PENDING_REGISTRATION_TTL_SECONDS,
  ) {}

  // Only the hash of the token is stored, so reading Redis does not yield a usable link.
  private tokenKey = (tokenHash: string) => `${this.prefix}:token:${tokenHash}`;
  private emailKey = (email: string) => `${this.prefix}:email:${sha256(normalizeEmail(email))}`;

  /**
   * Stores a pending registration and returns the one-time token for the confirmation link.
   * An earlier pending registration for the same address is replaced, and its link stops working.
   */
  async put(pending: PendingRegistration): Promise<string> {
    const entry: PendingRegistration = { ...pending, email: normalizeEmail(pending.email) };
    const token = randomBytes(32).toString("base64url");
    const tokenHash = sha256(token);
    const previous = await this.redis.get(this.emailKey(entry.email));
    const multi = this.redis.multi();
    if (previous) multi.del(this.tokenKey(previous));
    multi.set(this.tokenKey(tokenHash), JSON.stringify(entry), "EX", this.ttlSeconds);
    multi.set(this.emailKey(entry.email), tokenHash, "EX", this.ttlSeconds);
    await multi.exec();
    return token;
  }

  /** Issues a fresh link for a registration that is still pending. Null when there is none. */
  async reissue(email: string): Promise<{ token: string; pending: PendingRegistration } | null> {
    const tokenHash = await this.redis.get(this.emailKey(email));
    if (!tokenHash) return null;
    const pending = parse(await this.redis.get(this.tokenKey(tokenHash)));
    if (!pending) return null;
    return { token: await this.put(pending), pending };
  }

  /** Returns the pending registration for a token exactly once. Null when unknown, used or expired. */
  async take(token: string): Promise<PendingRegistration | null> {
    if (!token || token.length > 200) return null;
    const tokenHash = sha256(token);
    const pending = parse(await this.redis.getdel(this.tokenKey(tokenHash)));
    if (!pending) return null;
    // Remove the pointer only if it still points at this token.
    if ((await this.redis.get(this.emailKey(pending.email))) === tokenHash) await this.redis.del(this.emailKey(pending.email));
    return pending;
  }
}

function parse(raw: string | null): PendingRegistration | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingRegistration>;
    if (typeof value.email !== "string" || typeof value.name !== "string" || typeof value.passwordHash !== "string") return null;
    return { email: value.email, name: value.name, passwordHash: value.passwordHash, locale: value.locale === "he" ? "he" : "en" };
  } catch {
    return null;
  }
}
