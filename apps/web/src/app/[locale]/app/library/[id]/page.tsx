import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentStudy } from "@/components/app/document-study";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "app.study" }))("title") };
}

export default async function DocumentStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentStudy documentId={id} />;
}
