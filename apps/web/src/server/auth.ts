import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { createOrganizationWithOwner, getUser, schema } from "@hks/database";
import { AppError, log } from "@hks/shared";
import { getServices } from "./services";

/** Header our own route handler sets from the trusted proxy chain; client-sent values are discarded. */
export const CLIENT_IP_HEADER = "x-hks-client-ip";

const subjects = {
  verify_email: { en: "Confirm your email address", he: "אישור כתובת האימייל שלך" },
  reset_password: { en: "Reset your password", he: "איפוס הסיסמה שלך" },
} as const;
const bodies = {
  verify_email: {
    en: (url: string) => `Open this link to confirm your email address for HilaTech Knowledge Studio:\n\n${url}\n\nThe link expires in one hour. If you did not create an account, ignore this message.`,
    he: (url: string) => `פתחו את הקישור הבא כדי לאשר את כתובת האימייל שלכם ב-HilaTech Knowledge Studio:\n\n${url}\n\nהקישור תקף לשעה. אם לא יצרתם חשבון, אפשר להתעלם מההודעה.`,
  },
  reset_password: {
    en: (url: string) => `Open this link to choose a new password for HilaTech Knowledge Studio:\n\n${url}\n\nThe link expires in one hour. If you did not ask for this, ignore this message; your password stays the same.`,
    he: (url: string) => `פתחו את הקישור הבא כדי לבחור סיסמה חדשה ב-HilaTech Knowledge Studio:\n\n${url}\n\nהקישור תקף לשעה. אם לא ביקשתם זאת, אפשר להתעלם מההודעה; הסיסמה לא תשתנה.`,
  },
} as const;

function build() {
  const { config, db, limiter, mailer } = getServices();
  if (!config.AUTH_SECRET) throw new AppError("not_configured", "AUTH_SECRET is not set");

  const send = async (kind: keyof typeof subjects, user: { email: string; locale?: unknown }, url: string) => {
    if (!mailer) {
      // No mail transport: fail loudly rather than leave an account that can never be verified.
      log("error", "mail.not_configured", { kind });
      throw new AppError("not_configured", "Email delivery is not configured");
    }
    const locale = user.locale === "he" ? "he" : "en";
    await mailer.send({ to: user.email, kind, subject: subjects[kind][locale], text: bodies[kind][locale](url) });
  };

  return betterAuth({
    appName: "HilaTech Knowledge Studio",
    baseURL: config.APP_BASE_URL,
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.APP_BASE_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications },
    }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: config.APP_ENV === "production" || config.APP_BASE_URL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, defaultValue: "en", input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.AUTH_SIGNUP_ENABLED,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: config.AUTH_REQUIRE_EMAIL_VERIFICATION,
      autoSignIn: !config.AUTH_REQUIRE_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }) => send("reset_password", user, url),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => send("verify_email", user, url),
    },
    session: {
      expiresIn: config.AUTH_SESSION_DAYS * 24 * 3600,
      updateAge: 24 * 3600,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: config.LIMIT_AUTH_ATTEMPTS_PER_MINUTE },
        "/sign-up/email": { window: 60, max: config.LIMIT_AUTH_ATTEMPTS_PER_MINUTE },
        "/request-password-reset": { window: 300, max: 5 },
        "/reset-password": { window: 300, max: 10 },
        "/send-verification-email": { window: 300, max: 5 },
      },
      // Shared across instances: Redis, atomic increment.
      customStorage: {
        consume: async (key, rule) => {
          const result = await limiter.hit("auth", key, rule.max, rule.window);
          return { allowed: result.allowed, retryAfter: result.allowed ? null : result.retryAfterSeconds };
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const locale = (user as { locale?: unknown }).locale === "he" ? "he" : "en";
            return { data: { ...user, email: user.email.trim().toLowerCase(), locale } };
          },
          // Every new account gets its own organization and default workspace.
          after: async (user) => {
            const name = (user.name?.trim() || user.email.split("@")[0] || "Workspace").slice(0, 100);
            await createOrganizationWithOwner(db, {
              name,
              slug: `org-${user.id.replace(/-/g, "").slice(0, 20)}`,
              ownerUserId: user.id,
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await getUser(db, session.userId);
            if (!user || user.disabledAt) return false; // disabled accounts cannot open sessions
            return { data: session };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof build>;
const holder = globalThis as unknown as { __hksAuth?: Auth };

export function getAuth(): Auth {
  holder.__hksAuth ??= build();
  return holder.__hksAuth;
}
