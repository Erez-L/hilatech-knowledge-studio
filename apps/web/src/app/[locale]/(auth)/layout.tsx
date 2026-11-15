import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { backendConfigured } from "@/server/services";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("auth");
  const configured = backendConfigured();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col">
        <header className="flex h-18 items-center justify-between px-(--gutter)">
          <Link href="/" className="rounded-control">
            <Logo />
          </Link>
          <div className="flex items-center">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </header>
        <main id="main" className="flex flex-1 items-center px-(--gutter) py-10">
          <div className="mx-auto w-full max-w-[26rem]">
            {configured ? (
              children
            ) : (
              <div role="status">
                <h1 className="text-app-title leading-(--leading-heading) font-extrabold tracking-(--tracking-heading)">{t("signInTitle")}</h1>
                <p className="mt-4 rounded-control border border-border-strong bg-surface px-4 py-3 text-secondary">{t("errors.notConfigured")}</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Brand panel: the product's idea in one image — a quoted passage, marked. */}
      <aside aria-hidden className="relative hidden overflow-hidden bg-stage text-on-stage lg:flex lg:flex-col lg:justify-between lg:p-14">
        <p className="type-h2 max-w-[14ch]">{t("panelLine")}</p>
        <div className="paper ms-auto w-full max-w-[26rem] rotate-1 p-7 [--paper:#ffffff] [--border:#d6ddd5] [--foreground:#172623] [--highlight:#c7f36d]">
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-border pb-3 text-[#172623]">
            <span className="text-label font-semibold">{t("panelSource")}</span>
            <span className="type-meta text-[#5c6b66]">7</span>
          </div>
          <p className="text-[1.0625rem] leading-[1.8]">
            <mark className="mark-evidence">{t("panelQuote")}</mark>
          </p>
        </div>
      </aside>
    </div>
  );
}
