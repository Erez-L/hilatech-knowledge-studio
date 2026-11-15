"use client";

import { LoaderCircle, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type FieldName = "name" | "email" | "password";
type Errors = Partial<Record<FieldName, string>>;
type AuthError = { status?: number; code?: string } | null | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function useAuthMessages() {
  const t = useTranslations("auth.errors");
  const validate = (values: Partial<Record<FieldName, string>>, fields: FieldName[]): Errors => {
    const errors: Errors = {};
    for (const field of fields) {
      const value = (values[field] ?? "").trim();
      if (!value) errors[field] = t("required");
      else if (field === "email" && !EMAIL.test(value)) errors[field] = t("email");
      else if (field === "password" && fields.includes("name") && value.length < 10) errors[field] = t("passwordShort");
      else if (field === "password" && value.length > 128) errors[field] = t("passwordLong");
    }
    return errors;
  };
  const describe = (error: AuthError): string => {
    if (error?.status === 429) return t("rateLimited");
    if (error?.status === 503) return t("notConfigured");
    switch (error?.code) {
      case "INVALID_EMAIL_OR_PASSWORD":
      case "INVALID_PASSWORD":
      case "USER_NOT_FOUND":
        return t("invalidCredentials");
      case "EMAIL_NOT_VERIFIED":
        return t("notVerified");
      case "PASSWORD_TOO_SHORT":
        return t("passwordShort");
      case "PASSWORD_TOO_LONG":
        return t("passwordLong");
      case "INVALID_EMAIL":
        return t("email");
      case "EMAIL_PASSWORD_SIGN_UP_DISABLED":
      case "SIGN_UP_DISABLED":
        return t("signupDisabled");
      default:
        return t("generic");
    }
  };
  return { validate, describe };
}

function focusFirst(form: HTMLFormElement | null, errors: Errors) {
  const first = (["name", "email", "password"] as const).find((field) => errors[field]);
  if (first) form?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
}

function FormShell({ title, body, children, footer }: { title: string; body: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div>
      <h1 className="text-app-title leading-(--leading-heading) font-extrabold tracking-(--tracking-heading)">{title}</h1>
      <p className="mt-3 text-secondary">{body}</p>
      <div className="mt-8">{children}</div>
      {footer && <p className="mt-8 border-t border-border pt-6 text-small text-secondary">{footer}</p>}
    </div>
  );
}

function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full disabled:opacity-80">
      {pending && <LoaderCircle className="animate-spin" aria-hidden />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

const FormAlert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-control border border-danger/40 bg-danger-surface px-4 py-3 text-small font-medium text-danger empty:hidden">
    {children}
  </p>
);

function Notice({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div role="status">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-highlight text-foreground">
        <MailCheck className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 text-app-title leading-(--leading-heading) font-extrabold tracking-(--tracking-heading)">{title}</h1>
      <p className="mt-3 text-secondary [overflow-wrap:anywhere]">{body}</p>
      {children && <div className="mt-8 flex flex-wrap items-center gap-4">{children}</div>}
    </div>
  );
}

const linkClass = "font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground";

/* ------------------------------------------------------------------ sign in */

export function SignInForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const { validate, describe } = useAuthMessages();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<FieldName, string>;
    const found = validate(values, ["email", "password"]);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length) return focusFirst(formRef.current, found);
    setPending(true);
    const { error } = await authClient.signIn.email({
      email: values.email.trim(),
      password: values.password,
      callbackURL: `/${locale}/app`, // used for the verification link if the address is not yet confirmed
    });
    if (error) {
      setAlert(describe(error));
      setPending(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <FormShell
      title={t("signInTitle")}
      body={t("signInBody")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href="/sign-up" className={linkClass}>
            {t("createAccount")}
          </Link>
        </>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{alert}</FormAlert>
        <Field id="sign-in-email" name="email" type="email" label={t("email")} autoComplete="username" ltr error={errors.email} required />
        <Field
          id="sign-in-password"
          name="password"
          type="password"
          label={t("password")}
          autoComplete="current-password"
          error={errors.password}
          required
          trailing={
            <Link href="/forgot-password" className="text-label font-semibold text-secondary underline-offset-4 hover:text-foreground hover:underline">
              {t("forgot")}
            </Link>
          }
        />
        <SubmitButton pending={pending} label={t("signIn")} pendingLabel={t("signingIn")} />
      </form>
    </FormShell>
  );
}

/* ------------------------------------------------------------------ sign up */

export function SignUpForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const { validate, describe } = useAuthMessages();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<FieldName, string>;
    const found = validate(values, ["name", "email", "password"]);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length) return focusFirst(formRef.current, found);
    setPending(true);
    const email = values.email.trim();
    const { error } = await authClient.signUp.email({
      name: values.name.trim(),
      email,
      password: values.password,
      callbackURL: `/${locale}/app`,
      // Stored on the user so emails arrive in their language.
      ...({ locale } as object),
    });
    setPending(false);
    if (error) return setAlert(describe(error));
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Notice title={t("checkEmailTitle")} body={t("checkEmailBody", { email: sentTo })}>
        <Button
          variant="outline"
          onClick={async () => {
            const { error } = await authClient.sendVerificationEmail({ email: sentTo, callbackURL: `/${locale}/app` });
            setResent(!error);
          }}
        >
          {t("resend")}
        </Button>
        <p aria-live="polite" className="text-small text-secondary">
          {resent ? t("resent") : null}
        </p>
      </Notice>
    );
  }

  return (
    <FormShell
      title={t("signUpTitle")}
      body={t("signUpBody")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/sign-in" className={linkClass}>
            {t("signIn")}
          </Link>
        </>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{alert}</FormAlert>
        <Field id="sign-up-name" name="name" label={t("name")} autoComplete="name" maxLength={120} error={errors.name} required />
        <Field id="sign-up-email" name="email" type="email" label={t("email")} autoComplete="username" ltr error={errors.email} required />
        <Field
          id="sign-up-password"
          name="password"
          type="password"
          label={t("password")}
          autoComplete="new-password"
          hint={t("passwordHint")}
          error={errors.password}
          required
        />
        <SubmitButton pending={pending} label={t("signUp")} pendingLabel={t("signingUp")} />
      </form>
    </FormShell>
  );
}

/* ---------------------------------------------------------- forgot password */

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const { validate, describe } = useAuthMessages();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<FieldName, string>;
    const found = validate(values, ["email"]);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length) return focusFirst(formRef.current, found);
    setPending(true);
    const email = values.email.trim();
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` });
    setPending(false);
    if (error) return setAlert(describe(error));
    setSentTo(email); // the same confirmation whether or not the address has an account
  }

  if (sentTo) {
    return (
      <Notice title={t("forgotSentTitle")} body={t("forgotSentBody", { email: sentTo })}>
        <Link href="/sign-in" className={linkClass}>
          {t("signIn")}
        </Link>
      </Notice>
    );
  }

  return (
    <FormShell
      title={t("forgotTitle")}
      body={t("forgotBody")}
      footer={
        <Link href="/sign-in" className={linkClass}>
          {t("signIn")}
        </Link>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{alert}</FormAlert>
        <Field id="forgot-email" name="email" type="email" label={t("email")} autoComplete="username" ltr error={errors.email} required />
        <SubmitButton pending={pending} label={t("sendReset")} pendingLabel={t("sending")} />
      </form>
    </FormShell>
  );
}

/* ----------------------------------------------------------- reset password */

export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const t = useTranslations("auth");
  const { validate, describe } = useAuthMessages();
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<"form" | "done" | "invalid">(!token || invalid ? "invalid" : "form");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<FieldName, string>;
    // Same rules as sign-up: treat as a new password.
    const found = validate({ ...values, name: "x" }, ["name", "password"]);
    delete found.name;
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length) return focusFirst(formRef.current, found);
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: values.password, token: token! });
    setPending(false);
    if (!error) return setState("done");
    if (error.code === "INVALID_TOKEN") return setState("invalid");
    setAlert(describe(error));
  }

  if (state === "invalid") {
    return (
      <FormShell title={t("resetInvalidTitle")} body={t("resetInvalidBody")}>
        <Button asChild size="lg">
          <Link href="/forgot-password">{t("sendReset")}</Link>
        </Button>
      </FormShell>
    );
  }
  if (state === "done") {
    return (
      <Notice title={t("resetDoneTitle")} body={t("resetDoneBody")}>
        <Button asChild size="lg">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </Notice>
    );
  }
  return (
    <FormShell title={t("resetTitle")} body={t("resetBody")}>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormAlert>{alert}</FormAlert>
        <Field
          id="reset-password"
          name="password"
          type="password"
          label={t("newPassword")}
          autoComplete="new-password"
          hint={t("passwordHint")}
          error={errors.password}
          required
        />
        <SubmitButton pending={pending} label={t("saveReset")} pendingLabel={t("saving")} />
      </form>
    </FormShell>
  );
}
