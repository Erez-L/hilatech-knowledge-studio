import { log } from "@hks/shared";
import type { Mailer, MailMessage } from "./mail.ts";

/** A contact-form request, as it was stored. */
export type LeadForNotification = {
  name: string;
  email: string;
  company?: string | null;
  message: string;
  locale: string;
  receivedAt: string;
  requestId: string;
};

/** One line, no control characters: what the person typed must not be able to add mail headers. */
const oneLine = (text: string, max: number) => text.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * The message that tells the owner a contact-form request arrived. Plain text only. Replying
 * to it answers the person who wrote, because their address is the Reply-To.
 */
export function buildLeadNotification(lead: LeadForNotification, to: string): MailMessage {
  const name = oneLine(lead.name, 120);
  const company = oneLine(lead.company ?? "", 160);
  const text = [
    "A new request arrived from the contact form of HilaTech Knowledge Studio.",
    "",
    `Name: ${name}`,
    `Email: ${oneLine(lead.email, 254)}`,
    `Company: ${company || "(not given)"}`,
    `Language of the site: ${lead.locale === "he" ? "Hebrew" : "English"}`,
    `Received: ${oneLine(lead.receivedAt, 40)}`,
    `Reference: ${oneLine(lead.requestId, 64)}`,
    "",
    "Message:",
    lead.message.replace(/\r\n?/g, "\n").trim(),
    "",
    "Reply to this message to answer the sender. The request is also saved in the contact_leads table.",
  ].join("\n");
  return {
    to,
    kind: "lead_notification",
    subject: oneLine(`New contact request: ${name}${company ? ` (${company})` : ""}`, 200),
    text,
    replyTo: oneLine(lead.email, 254),
  };
}

/**
 * Tells the owner about a stored request. The request is already saved when this runs, so a
 * mail problem must not turn into an error for the visitor: this never throws. It reports what
 * happened, and logs it without any personal data.
 */
export async function notifyLead(mailer: Mailer | null, to: string | undefined, lead: LeadForNotification): Promise<"sent" | "skipped" | "failed"> {
  if (!to) return "skipped"; // no owner address configured: notifications are off
  if (!mailer) {
    log("warn", "lead.notification_not_configured", { requestId: lead.requestId });
    return "skipped";
  }
  try {
    await mailer.send(buildLeadNotification(lead, to));
    log("info", "lead.notification_sent", { requestId: lead.requestId });
    return "sent";
  } catch (error) {
    log("error", "lead.notification_failed", { requestId: lead.requestId, name: (error as Error).name });
    return "failed";
  }
}
