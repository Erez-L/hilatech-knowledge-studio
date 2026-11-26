import { ArrowUp, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import { documents, getPassage } from "@/sample/northstar";
import { FileGlyph } from "@/components/shared/file-glyph";

export function HowItWorks() {
  const t = useTranslations("how");
  const locale = useLocale() as Locale;
  const passage = getPassage("handbook-refund-approval")!;

  const steps: { key: "add" | "ask" | "verify"; vignette: ReactNode }[] = [
    {
      key: "add",
      vignette: (
        <ul className="flex w-full flex-col gap-2">
          {documents.slice(0, 3).map((doc, index) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-control border border-border bg-surface px-3 py-2.5"
            >
              <FileGlyph kind={doc.kind} />
              <span className="ltr-run truncate-start flex-1 text-start text-label font-medium">{doc.fileName}</span>
              {index < 2 ? (
                <span className="flex shrink-0 items-center gap-1 text-label font-semibold text-success">
                  <Check className="size-3.5" />
                  {t("vignette.ready")}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-2 text-label font-medium text-tertiary">
                  <span className="h-1 w-10 overflow-hidden rounded-full bg-hover">
                    <span className="block h-full w-3/5 rounded-full bg-brand" />
                  </span>
                  {t("vignette.reading")}
                </span>
              )}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "ask",
      vignette: (
        <div className="flex w-full items-end gap-3 rounded-panel border border-border-strong bg-surface p-3 ps-4 shadow-raised">
          <p className="flex-1 py-2 text-[0.9375rem] leading-snug font-medium">
            {t("vignette.askPlaceholder")}
            <span className="ms-0.5 inline-block h-[1.1em] w-0.5 translate-y-[0.2em] bg-foreground" />
          </p>
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-on-accent">
            <ArrowUp className="size-5" />
          </span>
        </div>
      ),
    },
    {
      key: "verify",
      vignette: (
        <div className="paper w-full p-4">
          <div className="mb-2 flex items-center justify-between gap-3 border-b border-border pb-2">
            <span className="truncate-start text-label font-semibold">{t("vignette.verifyLocator")}</span>
            <span className="type-meta inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-accent font-medium text-on-accent">
              2
            </span>
          </div>
          <p className="text-label leading-[1.7] text-secondary">
            <mark className="mark-evidence">{passage.evidence[locale]}</mark>
          </p>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="page-container py-(--space-section)">
      <h2 className="type-h2 max-w-[22ch]">{t("title")}</h2>
      <ol className="mt-14 grid gap-y-14 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className="flex min-w-0 flex-col border-t border-foreground pt-5 lg:border-s lg:border-t lg:border-s-border lg:px-8 lg:first:border-s-0 lg:first:ps-0 lg:last:pe-0"
          >
            <span className="type-meta text-tertiary" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div aria-hidden className="flex min-w-0 items-center py-8 lg:h-60 lg:py-6">
              {step.vignette}
            </div>
            <h3 className="type-h3">{t(`steps.${step.key}.title`)}</h3>
            <p className="mt-3 max-w-[34ch] text-secondary">{t(`steps.${step.key}.body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
