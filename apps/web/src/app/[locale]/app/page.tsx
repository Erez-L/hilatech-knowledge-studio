import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { AskWorkspace } from "@/components/app/ask-workspace";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "app.nav" }))("workspace") };
}

export default function AppPage() {
  return (
    <Suspense>
      <AskWorkspace />
    </Suspense>
  );
}
