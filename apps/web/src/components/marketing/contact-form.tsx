"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent } from "react";
import {
  CONTACT_LIMITS,
  contactSchema,
  fieldErrors,
  type ContactErrorCode,
  type ContactField,
  type ContactResponse,
} from "@/lib/contact";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type Status = "idle" | "submitting" | "success";
type FormError = "server" | "rateLimited" | "unavailable" | null;

export function ContactForm() {
  const t = useTranslations("contact");
  const locale = useLocale();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Partial<Record<ContactField, ContactErrorCode>>>({});
  const [formError, setFormError] = useState<FormError>(null);

  const errorText = (field: ContactField) => {
    const code = errors[field];
    if (!code) return null;
    return code === "tooLong" ? t("errors.tooLong", { max: CONTACT_LIMITS[field] }) : t(`errors.${code}`);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const parsed = contactSchema.safeParse({ ...data, locale });
    setFormError(null);

    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      const first = (["name", "email", "company", "message"] as const).find((field) => next[field]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setErrors({});
    setStatus("submitting");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => null)) as ContactResponse | null;
      if (response.ok && body?.ok) {
        setStatus("success");
        return;
      }
      if (body && !body.ok && body.error.code === "validation" && body.fields) setErrors(body.fields);
      else setFormError(response.status === 429 ? "rateLimited" : response.status === 503 ? "unavailable" : "server");
    } catch {
      setFormError("server");
    }
    setStatus("idle");
  }

  if (status === "success") {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-panel border border-stage-border bg-stage-raised p-8">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-on-accent">
          <Check className="size-5" aria-hidden />
        </span>
        <h3 className="type-h3">{t("successTitle")}</h3>
        <p className="text-on-stage-muted">{t("successBody")}</p>
        <Button variant="onStage" onClick={() => setStatus("idle")}>
          {t("sendAnother")}
        </Button>
      </div>
    );
  }

  const field = (name: ContactField, label: string, options: { type?: string; autoComplete?: string; optional?: boolean; multiline?: boolean; dir?: "ltr" }) => {
    const id = `${formId}-${name}`;
    const error = errorText(name);
    const shared = {
      id,
      name,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${id}-error` : undefined,
      required: !options.optional,
      maxLength: CONTACT_LIMITS[name] + 200, // let the validator explain the limit instead of silently truncating
      className: cn(
        "w-full rounded-control border bg-stage-raised px-4 text-body text-on-stage placeholder:text-on-stage-muted",
        "transition-[border-color,box-shadow] duration-150 outline-none",
        "focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25",
        error ? "border-danger" : "border-stage-border hover:border-on-stage-muted",
        options.multiline ? "min-h-32 resize-y py-3 leading-relaxed" : "h-12",
        options.dir === "ltr" && "ltr-run text-start",
      ),
    };
    return (
      <div className={cn("flex flex-col gap-2", options.multiline && "sm:col-span-2")}>
        <label htmlFor={id} className="text-small font-semibold">
          {label}
          {options.optional && <span className="ms-2 font-normal text-on-stage-muted">({t("optional")})</span>}
        </label>
        {options.multiline ? (
          <textarea {...shared} rows={4} />
        ) : (
          <input {...shared} type={options.type ?? "text"} autoComplete={options.autoComplete} />
        )}
        {error && (
          <p id={`${id}-error`} className="text-small font-medium text-[#f6a69c]">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
      {field("name", t("name"), { autoComplete: "name" })}
      {field("email", t("email"), { type: "email", autoComplete: "email", dir: "ltr" })}
      <div className="sm:col-span-2">{field("company", t("company"), { autoComplete: "organization", optional: true })}</div>
      {field("message", t("message"), { multiline: true })}
      {/* Honeypot: hidden from people and assistive technology. */}
      <div aria-hidden className="absolute -start-[9999px] size-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-col gap-4 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="accent" size="lg" disabled={status === "submitting"} className="disabled:opacity-80">
          {status === "submitting" && <LoaderCircle className="animate-spin" aria-hidden />}
          {status === "submitting" ? t("submitting") : t("submit")}
        </Button>
        <p role="alert" className="text-small font-medium text-[#f6a69c] empty:hidden">
          {formError ? t(`errors.${formError}`) : null}
        </p>
      </div>
    </form>
  );
}
