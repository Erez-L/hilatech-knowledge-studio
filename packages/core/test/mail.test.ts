import { describe, expect, it } from "vitest";
import { AppError } from "@hks/shared";
import { SesMailer, type SesSend } from "../src/mail";

const message = { to: "person@example.com", subject: "אימות כתובת", text: "https://example.test/he/verify-email?token=abc", kind: "verify_email" as const };

describe("SesMailer", () => {
  it("sends the message from the configured address", async () => {
    const calls: Parameters<SesSend>[0][] = [];
    const mailer = new SesMailer("us-east-1", "Studio <no-reply@example.test>", async (input) => {
      calls.push(input);
    });
    await mailer.send(message);
    expect(calls).toEqual([
      { from: "Studio <no-reply@example.test>", to: message.to, subject: message.subject, text: message.text },
    ]);
  });

  it("hides the provider error from the caller", async () => {
    const mailer = new SesMailer("us-east-1", "Studio <no-reply@example.test>", async () => {
      throw new Error("MessageRejected: Email address is not verified: person@example.com");
    });
    const error = await mailer.send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).detail).toBe("The email could not be sent");
    expect((error as Error).message).not.toContain("person@example.com");
  });
});
