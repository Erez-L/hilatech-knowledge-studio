import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VerifyEmail } from "@/components/auth/auth-forms";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // The token is in the address: keep it out of search engines and out of Referer headers.
  return { title: (await getTranslations({ locale, namespace: "auth" }))("verifyTitle"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyEmail token={typeof token === "string" ? token : null} />;
}
