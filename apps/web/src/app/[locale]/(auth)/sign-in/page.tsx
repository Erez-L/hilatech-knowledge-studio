import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "auth" }))("signInTitle"), robots: { index: false } };
}

export default function Page() {
  return <SignInForm />;
}
