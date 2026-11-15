import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AskWorkspace } from "@/components/app/ask-workspace";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "app.nav" }))("workspace") };
}

export default function AppPage() {
  // Rendered per request (see the layout), so no Suspense boundary is needed for the search parameters,
  // and the workspace hydrates together with its provider.
  return <AskWorkspace />;
}
