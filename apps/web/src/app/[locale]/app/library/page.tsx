import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Library } from "@/components/app/library";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "app.library" }))("title") };
}

export default function LibraryPage() {
  return <Library />;
}
