import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { AppProvider } from "@/components/app/app-provider";
import { AppShell } from "@/components/app/app-shell";
import { getAuth } from "@/server/auth";
import { backendConfigured } from "@/server/services";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

/**
 * Everything under /app requires a session. The check runs on the server for
 * every request; the API enforces it again on each call.
 */
export default async function AppLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (!backendConfigured()) {
    const t = await getTranslations({ locale, namespace: "auth" });
    return (
      <main className="page-container flex min-h-dvh items-center">
        <p role="status" className="rounded-control border border-border-strong bg-surface px-5 py-4 text-secondary">
          {t("errors.notConfigured")}
        </p>
      </main>
    );
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect({ href: "/sign-in", locale });

  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
