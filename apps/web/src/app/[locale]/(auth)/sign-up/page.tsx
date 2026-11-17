import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getConfig } from "@hks/shared";
import { SignUpClosed, SignUpForm } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "auth" }))("signUpTitle"), robots: { index: false } };
}

function signUpOpen(): boolean {
  try {
    return getConfig().AUTH_SIGNUP_ENABLED;
  } catch {
    return false;
  }
}

export default function Page() {
  // A closed sign-up says so, instead of showing a form that can only fail.
  return signUpOpen() ? <SignUpForm /> : <SignUpClosed />;
}
