import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { findUserByEmail } from "@hks/database";
import { AppError, log } from "@hks/shared";
import { getAuth } from "./auth";
import { sendAuthMail } from "./auth-mail";
import { enforceRateLimit } from "./http";
import { getServices } from "./services";

/**
 * Sign-up in two steps.
 *
 * 1. `startRegistration`: the form is validated, the password is hashed, and the details wait
 *    in Redis for one hour. A confirmation link goes to the address. PostgreSQL is not touched.
 * 2. `completeRegistration`: opening the link and confirming creates the user, the credential
 *    account and the organization, with the email already marked as verified.
 *
 * Better Auth's own sign-up endpoint is closed (see auth.ts); sign-in, sessions and password
 * reset still belong to it.
 */

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
  locale: z.enum(["en", "he"]),
});
export const resendSchema = registerSchema.pick({ email: true, locale: true });
export const verifySchema = z.object({ token: z.string().min(20).max(200) });

const emailKey = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);
const who = (ip: string | null) => ip ?? "unidentified";

function requireOpenSignUp() {
  const { config, mailer } = getServices();
  if (!config.AUTH_SIGNUP_ENABLED) throw new AppError("forbidden", "New accounts are not open at the moment");
  if (!mailer) throw new AppError("not_configured", "Email delivery is not configured");
  return mailer;
}

const confirmationLink = (locale: string, token: string) =>
  `${getServices().config.APP_BASE_URL}/${locale}/verify-email?token=${encodeURIComponent(token)}`;

/**
 * Answers the same way whether or not the address already has an account, so the form
 * cannot be used to find out who is registered. An existing account gets no email.
 */
export async function startRegistration(input: z.infer<typeof registerSchema>, ip: string | null): Promise<void> {
  const mailer = requireOpenSignUp();
  const { config, db, pendingRegistrations } = getServices();
  await enforceRateLimit("signup-ip", who(ip), config.LIMIT_AUTH_ATTEMPTS_PER_MINUTE, 60);
  await enforceRateLimit("signup-email", emailKey(input.email), 3, 3600);

  if (await findUserByEmail(db, input.email)) {
    log("info", "signup.address_already_registered", {});
    return;
  }
  const context = await getAuth().$context;
  const passwordHash = await context.password.hash(input.password);
  const token = await pendingRegistrations.put({ email: input.email, name: input.name, passwordHash, locale: input.locale });
  await sendAuthMail(mailer, "verify_email", { email: input.email, locale: input.locale }, confirmationLink(input.locale, token));
  log("info", "signup.confirmation_sent", {});
}

/** Sends a fresh link for a sign-up that is still waiting. Silent when there is none. */
export async function resendRegistration(input: z.infer<typeof resendSchema>, ip: string | null): Promise<void> {
  const mailer = requireOpenSignUp();
  const { pendingRegistrations } = getServices();
  await enforceRateLimit("signup-resend-ip", who(ip), 5, 300);
  await enforceRateLimit("signup-resend-email", emailKey(input.email), 3, 3600);
  const reissued = await pendingRegistrations.reissue(input.email);
  if (!reissued) return;
  const locale = reissued.pending.locale;
  await sendAuthMail(mailer, "verify_email", { email: reissued.pending.email, locale }, confirmationLink(locale, reissued.token));
}

/** Creates the account for a confirmed address. The link works once. */
export async function completeRegistration(token: string, ip: string | null): Promise<void> {
  const { db, pendingRegistrations } = getServices();
  await enforceRateLimit("signup-verify-ip", who(ip), 20, 60);
  const pending = await pendingRegistrations.take(token);
  if (!pending) throw new AppError("not_found", "This link is invalid or has expired");

  // Confirmed twice, or registered in another way in the meantime: nothing more to create.
  if (await findUserByEmail(db, pending.email)) return;

  const context = await getAuth().$context;
  // The user.create hooks in auth.ts run here too and give the account its organization.
  const user = await context.internalAdapter.createUser(
    { email: pending.email, name: pending.name, emailVerified: true, locale: pending.locale },
    { method: "email-password" },
  );
  if (!user) throw new AppError("internal", "The account could not be created");
  await context.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: pending.passwordHash });
  log("info", "signup.completed", {});
}
