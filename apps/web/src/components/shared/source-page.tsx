import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { getDocument, type Passage, type SampleDocument } from "@/sample/northstar";
import { cn } from "@/lib/cn";

export function useLocatorLabel() {
  const t = useTranslations("common");
  return (doc: SampleDocument, locator: string, withTotal = false) => {
    if (doc.unit === "section") return t("section", { n: locator });
    return withTotal
      ? t("pageOf", { n: locator, total: doc.locators.length })
      : t("page", { n: locator });
  };
}

type SourcePageProps = {
  passage: Passage;
  active?: boolean;
  /** "pending" hides the highlight until it is swept in. */
  sweep?: "pending" | "done";
  size?: "sm" | "md";
  showHeader?: boolean;
  className?: string;
  markRef?: (el: HTMLElement | null) => void;
};

/**
 * A page of a source document, showing extracted text with the cited passage
 * highlighted. Text shown here is always document content, never an answer.
 */
export function SourcePage({
  passage,
  active,
  sweep,
  size = "md",
  showHeader = true,
  className,
  markRef,
}: SourcePageProps) {
  const locale = useLocale() as Locale;
  const locatorLabel = useLocatorLabel();
  const doc = getDocument(passage.documentId);
  if (!doc) return null;

  return (
    <article
      className={cn(
        "paper flex flex-col",
        size === "md" ? "gap-4 p-6 sm:p-7" : "gap-3 p-4 sm:p-5",
        className,
      )}
    >
      {showHeader && (
        <header className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <span className="truncate-start text-label font-semibold">{doc.title[locale]}</span>
          <span className="type-meta shrink-0 text-tertiary">{locatorLabel(doc, passage.locator)}</span>
        </header>
      )}
      <p className={cn("font-bold text-foreground tracking-(--tracking-heading)", size === "md" ? "text-[1.0625rem]" : "text-small")}>
        {passage.heading[locale]}
      </p>
      <p className={cn("text-secondary", size === "md" ? "text-[0.9375rem] leading-[1.75]" : "text-label leading-[1.7]")}>
        {passage.before[locale]}{" "}
        <mark
          ref={markRef}
          className="mark-evidence"
          data-active={active || undefined}
          data-sweep={sweep}
        >
          {passage.evidence[locale]}
        </mark>{" "}
        {passage.after[locale]}
      </p>
    </article>
  );
}
