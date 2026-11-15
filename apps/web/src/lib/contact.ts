import { z } from "zod";

export const CONTACT_LIMITS = { name: 120, email: 254, company: 160, message: 2000 } as const;

/** Shared by the form (client) and the route handler (server). */
export const contactSchema = z.object({
  name: z.string().trim().min(1, "required").max(CONTACT_LIMITS.name, "tooLong"),
  email: z.string().trim().min(1, "required").max(CONTACT_LIMITS.email, "tooLong").pipe(z.email("email")),
  company: z.string().trim().max(CONTACT_LIMITS.company, "tooLong").optional().default(""),
  message: z.string().trim().min(1, "required").max(CONTACT_LIMITS.message, "tooLong"),
  locale: z.enum(["en", "he"]),
  /** Honeypot: real people never fill this in. */
  website: z.string().max(0).optional().default(""),
});

export type ContactInput = z.input<typeof contactSchema>;
export type ContactLead = z.output<typeof contactSchema>;
export type ContactField = "name" | "email" | "company" | "message";
export type ContactErrorCode = "required" | "email" | "tooLong";

export type ContactResponse =
  | { ok: true }
  | {
      ok: false;
      error: { code: "validation" | "rate_limited" | "not_configured" | "bad_request" | "internal"; requestId: string };
      fields?: Partial<Record<ContactField, ContactErrorCode>>;
    };

export function fieldErrors(error: z.ZodError): Partial<Record<ContactField, ContactErrorCode>> {
  const out: Partial<Record<ContactField, ContactErrorCode>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "name" || field === "email" || field === "company" || field === "message") && !out[field]) {
      out[field] = (["required", "email", "tooLong"] as const).includes(issue.message as ContactErrorCode)
        ? (issue.message as ContactErrorCode)
        : "required";
    }
  }
  return out;
}
