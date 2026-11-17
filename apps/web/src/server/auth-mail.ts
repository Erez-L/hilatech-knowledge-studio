import "server-only";
import type { Mailer } from "@hks/core";
import { AppError, log } from "@hks/shared";

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

export type AuthMailKind = keyof typeof subjects;

/** Sends one of the account emails in the recipient's language. Throws `not_configured` without a mail transport. */
export async function sendAuthMail(mailer: Mailer | null, kind: AuthMailKind, to: { email: string; locale: "en" | "he" }, url: string) {
  if (!mailer) {
    // No mail transport: fail loudly rather than accept a sign-up that can never be confirmed.
    log("error", "mail.not_configured", { kind });
    throw new AppError("not_configured", "Email delivery is not configured");
  }
  await mailer.send({ to: to.email, kind, subject: subjects[kind][to.locale], text: bodies[kind][to.locale](url) });
}
