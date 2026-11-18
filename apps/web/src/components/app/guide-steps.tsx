"use client";

import { FolderOpen, Highlighter, MessagesSquare, ShieldCheck, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const STEPS = [
  { key: "project", Icon: FolderOpen },
  { key: "upload", Icon: Upload },
  { key: "ask", Icon: MessagesSquare },
  { key: "check", Icon: ShieldCheck },
  { key: "summarize", Icon: Highlighter },
] as const;

/**
 * The working order of the application, shown where a new user lands: choose a project, add
 * documents, ask, check the sources, and mark-and-summarize a document.
 */
export function GuideSteps({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations("app.guide");
  return (
    <section aria-labelledby="guide-steps-title" className={cn("rounded-panel border border-border bg-surface p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="guide-steps-title" className="text-[1.0625rem] font-bold">{t("title")}</h2>
        <Link href="/help" className="text-small font-semibold text-foreground underline underline-offset-4 hover:no-underline">
          {t("more")}
        </Link>
      </div>
      <ol className={cn("mt-4 grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-5")}>
        {STEPS.map(({ key, Icon }, index) => (
          <li key={key} className="flex gap-3 rounded-control bg-sunken p-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface text-foreground shadow-raised">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-small font-semibold">
                <span className="text-tertiary">{index + 1}. </span>
                {t(`${key}.title`)}
              </span>
              <span className="mt-0.5 block text-label leading-relaxed text-secondary">{t(`${key}.body`)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
