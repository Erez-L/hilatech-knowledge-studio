import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listDocuments, withTenant } from "@hks/database";
import { AppProvider } from "@/components/app/app-provider";
import { AppShell } from "@/components/app/app-shell";
import { AskWorkspace } from "@/components/app/ask-workspace";
import { KnowledgeWorkspace } from "@/components/workspace/knowledge-workspace";
import { demoTenant } from "@/server/demo";
import { backendConfigured, getServices } from "@/server/services";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("demoTitle") };
}

/**
 * True when this deployment can answer demo questions for real: the backend is
 * configured, a chat model and an embeddings model are connected, and the demo
 * organization holds at least one indexed document.
 */
async function liveDemoAvailable(): Promise<boolean> {
  if (!backendConfigured()) return false;
  try {
    const { db, chat, embeddings } = getServices();
    if (!chat || !embeddings) return false;
    const tenant = await demoTenant();
    if (!tenant) return false;
    const documents = await withTenant(db, tenant.organizationId, (tx) => listDocuments(tx, tenant));
    return documents.some((d) => d.status === "ready");
  } catch {
    return false;
  }
}

/**
 * The public demo. With a seeded demo organization it is the real workspace,
 * limited to the fictional Northstar documents. Otherwise it is the scripted
 * interface preview, which labels itself as a sample.
 */
export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await liveDemoAvailable())) return <KnowledgeWorkspace />;
  return (
    <AppProvider scope="demo">
      <AppShell>
        {/* No Suspense boundary here: the workspace must hydrate together with its provider. A boundary
            hydrates later, after the provider's first request may have changed what the workspace shows. */}
        <AskWorkspace />
      </AppShell>
    </AppProvider>
  );
}
