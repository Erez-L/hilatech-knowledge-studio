import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "auth" }))("resetTitle"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" ? token : null} invalid={Boolean(error)} />;
}
