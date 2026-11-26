import { describe, expect, it } from "vitest";
import { AppError, parseConfig } from "@hks/shared";
import { buildLeadNotification, notifyLead } from "../src/lead-notification";
import { SesMailer, type MailMessage, type Mailer, type SesSend } from "../src/mail";

const lead = {
  name: "Dana Levi",
  email: "dana@customer.example",
  company: "Levi Logistics",
  message: "We have 400 procedure documents.\r\nCan the team search them in Hebrew?",
  locale: "he",
  receivedAt: "2026-11-26T10:00:00.000Z",
  requestId: "5f0c1f6e-0000-4000-8000-000000000001",
};
const OWNER = "owner@studio.example";

const recorder = () => {
  const sent: MailMessage[] = [];
  const mailer: Mailer = { send: async (message) => void sent.push(message) };
  return { sent, mailer };
};

describe("contact-form notification to the owner", () => {
  it("carries everything the visitor wrote, to the configured address, with the visitor as Reply-To", () => {
    const message = buildLeadNotification(lead, OWNER);
    expect(message).toMatchObject({ to: OWNER, kind: "lead_notification", replyTo: "dana@customer.example", subject: "New contact request: Dana Levi (Levi Logistics)" });
    for (const part of ["Name: Dana Levi", "Email: dana@customer.example", "Company: Levi Logistics", "Language of the site: Hebrew", "Received: 2026-11-26T10:00:00.000Z", lead.requestId]) {
      expect(message.text).toContain(part);
    }
    expect(message.text).toContain("We have 400 procedure documents.\nCan the team search them in Hebrew?");
    expect(buildLeadNotification({ ...lead, company: "" }, OWNER)).toMatchObject({ subject: "New contact request: Dana Levi" });
    expect(buildLeadNotification({ ...lead, company: null }, OWNER).text).toContain("Company: (not given)");
  });

  it("keeps typed line breaks out of the subject and the header-like lines", () => {
    const message = buildLeadNotification({ ...lead, name: "Eve\r\nBcc: victim@example.test", company: "X\nSubject: other" }, OWNER);
    expect(message.subject).toBe("New contact request: Eve Bcc: victim@example.test (X Subject: other)");
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.text).toContain("Name: Eve Bcc: victim@example.test\n");
    expect(buildLeadNotification({ ...lead, name: "n".repeat(500) }, OWNER).subject.length).toBeLessThanOrEqual(200);
  });

  it("sends one message per request", async () => {
    const { sent, mailer } = recorder();
    expect(await notifyLead(mailer, OWNER, lead)).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(OWNER);
  });

  it("does nothing without an owner address, and only reports when there is no mail transport", async () => {
    const { sent, mailer } = recorder();
    expect(await notifyLead(mailer, undefined, lead)).toBe("skipped");
    expect(await notifyLead(mailer, "", lead)).toBe("skipped");
    expect(sent).toHaveLength(0);
    expect(await notifyLead(null, OWNER, lead)).toBe("skipped");
  });

  it("never throws when the mail cannot be sent: the request is already saved", async () => {
    const failing: Mailer = {
      send: async () => {
        throw new AppError("internal", "The email could not be sent");
      },
    };
    expect(await notifyLead(failing, OWNER, lead)).toBe("failed");
  });

  it("passes the Reply-To through the SES mailer, and leaves it out of account mail", async () => {
    const calls: Parameters<SesSend>[0][] = [];
    const mailer = new SesMailer("us-east-1", "Studio <no-reply@studio.example>", async (input) => void calls.push(input));
    await notifyLead(mailer, OWNER, lead);
    await mailer.send({ to: "person@example.com", subject: "s", text: "t", kind: "verify_email" });
    expect(calls[0]).toMatchObject({ from: "Studio <no-reply@studio.example>", to: OWNER, replyTo: "dana@customer.example" });
    expect(calls[1]).toEqual({ from: "Studio <no-reply@studio.example>", to: "person@example.com", subject: "s", text: "t" });
    expect("replyTo" in calls[1]!).toBe(false);
  });
});

describe("LEADS_NOTIFY_EMAIL", () => {
  it("is off by default, accepts an address, treats an empty value as off, and refuses anything else", () => {
    expect(parseConfig({ APP_ENV: "test" }).LEADS_NOTIFY_EMAIL).toBeUndefined();
    expect(parseConfig({ APP_ENV: "test", LEADS_NOTIFY_EMAIL: " owner@studio.example " }).LEADS_NOTIFY_EMAIL).toBe("owner@studio.example");
    expect(parseConfig({ APP_ENV: "test", LEADS_NOTIFY_EMAIL: "" }).LEADS_NOTIFY_EMAIL).toBeUndefined();
    expect(() => parseConfig({ APP_ENV: "test", LEADS_NOTIFY_EMAIL: "not an address" })).toThrow(/LEADS_NOTIFY_EMAIL/);
  });
});
