import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { AppError, log, type Config } from "@hks/shared";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** What the message is for; safe to log. */
  kind: "verify_email" | "reset_password";
};

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development and test "transport": appends each message to a local JSON-lines
 * file and sends nothing. Open the file to copy a verification or reset link.
 * Refused in production by configuration.
 */
export class FileOutboxMailer implements Mailer {
  constructor(private readonly file: string, private readonly from: string) {}
  async send(message: MailMessage) {
    const file = path.resolve(this.file);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await appendFile(file, `${JSON.stringify({ ...message, from: this.from, sentAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    log("info", "mail.written_to_outbox", { kind: message.kind });
  }
}

/** SMTP through nodemailer. NOT YET VERIFIED against a mail server. */
export class SmtpMailer implements Mailer {
  private transport: import("nodemailer").Transporter | undefined;
  constructor(private readonly url: string, private readonly from: string) {}
  async send(message: MailMessage) {
    this.transport ??= (await import("nodemailer")).default.createTransport(this.url);
    try {
      await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
      log("info", "mail.sent", { kind: message.kind });
    } catch (error) {
      log("error", "mail.failed", { kind: message.kind, name: (error as Error).name });
      throw new AppError("internal", "The email could not be sent");
    }
  }
}

/** Returns null when mail is not configured; callers must then say so. */
export function createMailer(config: Config): Mailer | null {
  if (config.MAIL_TRANSPORT === "file") return new FileOutboxMailer(config.MAIL_OUTBOX_FILE, config.MAIL_FROM);
  if (config.MAIL_TRANSPORT === "smtp") return new SmtpMailer(config.SMTP_URL!, config.MAIL_FROM);
  return null;
}
