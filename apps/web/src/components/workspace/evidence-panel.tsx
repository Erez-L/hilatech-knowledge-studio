"use client";

import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/routing";
import { getDocument, passages, type Passage } from "@/sample/northstar";
import { cn } from "@/lib/cn";
import { FileGlyph } from "@/components/shared/file-glyph";
import { useLocatorLabel } from "@/components/shared/source-page";

type EvidencePanelProps = {
  /** Passages cited by the answer in focus, in citation order. */
  sources: Passage[];
  selectedPassageId: string | null;
  documentId: string | null;
  locator: string | null;
  onSelectSource: (passageId: string) => void;
  onNavigate: (documentId: string, locator: string) => void;
};

/**
 * The research side of the workspace: the sources behind an answer, and the
 * document text they were taken from. Everything in the viewer is document
 * content; nothing here is generated.
 */
export function EvidencePanel({
  sources,
  selectedPassageId,
  documentId,
  locator,
  onSelectSource,
  onNavigate,
}: EvidencePanelProps) {
  const t = useTranslations("workspace.evidence");
  const locale = useLocale() as Locale;
  const locatorLabel = useLocatorLabel();
  const viewerRef = useRef<HTMLElement>(null);

  const doc = documentId ? getDocument(documentId) : undefined;
  const index = doc && locator ? doc.locators.indexOf(locator) : -1;
  const pagePassages = doc && locator ? passages.filter((p) => p.documentId === doc.id && p.locator === locator) : [];
  const citedIds = new Set(sources.map((s) => s.id));

  // Bring the document into view when a source is chosen on a short screen.
  useEffect(() => {
    if (!selectedPassageId) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewerRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selectedPassageId]);

  return (
    <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-5">
      {sources.length > 0 && (
        <section aria-labelledby="evidence-sources">
          <h3 id="evidence-sources" className="mb-3 text-label font-semibold text-tertiary">
            {t("sourcesHeading")}
          </h3>
          <ol className="flex flex-col gap-2">
            {sources.map((source, i) => {
              const sourceDoc = getDocument(source.documentId)!;
              const selected = source.id === selectedPassageId;
              return (
                <li key={source.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectSource(source.id)}
                    className={cn(
                      "flex w-full gap-3 rounded-control border p-3 text-start transition-[border-color,background-color] duration-150",
                      selected
                        ? "border-foreground/70 bg-surface"
                        : "border-border bg-transparent hover:border-border-strong hover:bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "type-meta mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border font-medium",
                        selected ? "border-transparent bg-accent text-on-accent" : "border-border-strong text-secondary",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate-start text-small font-semibold">{sourceDoc.title[locale]}</span>
                        <span className="type-meta shrink-0 text-tertiary">{locatorLabel(sourceDoc, source.locator)}</span>
                      </span>
                      <span className="mt-1 line-clamp-2 text-label leading-relaxed text-secondary">
                        {source.evidence[locale]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {doc && locator && (
        <section ref={viewerRef} aria-labelledby="evidence-document" className="flex flex-col">
          <h3 id="evidence-document" className="mb-3 text-label font-semibold text-tertiary">
            {t("documentHeading")}
          </h3>

          <div className="flex items-center gap-3 rounded-t-control border border-b-0 border-border bg-surface px-3 py-2">
            <FileGlyph kind={doc.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate-start text-small font-semibold">{doc.title[locale]}</p>
              <p className="ltr-run type-meta truncate-start text-start text-tertiary rtl:text-end">{doc.fileName}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border border-border bg-sunken px-1.5 py-1">
            <button
              type="button"
              className={pagerClass}
              disabled={index <= 0}
              aria-label={t("previous")}
              onClick={() => onNavigate(doc.id, doc.locators[index - 1]!)}
            >
              <ChevronLeft className="size-4.5 rtl:-scale-x-100" aria-hidden />
            </button>
            <p className="type-meta text-secondary" aria-live="polite">
              {locatorLabel(doc, locator, true)}
            </p>
            <button
              type="button"
              className={pagerClass}
              disabled={index < 0 || index >= doc.locators.length - 1}
              aria-label={t("next")}
              onClick={() => onNavigate(doc.id, doc.locators[index + 1]!)}
            >
              <ChevronRight className="size-4.5 rtl:-scale-x-100" aria-hidden />
            </button>
          </div>

          <div key={`${doc.id}-${locator}`} className="paper animate-[block-in_260ms_var(--ease-out)] rounded-t-none border-t-0 p-6">
            {pagePassages.length > 0 ? (
              <>
                <p className="type-meta mb-4 text-tertiary">{t("extracted")}</p>
                {pagePassages.map((passage) => {
                  const cited = citedIds.has(passage.id);
                  return (
                    <div key={passage.id}>
                      <h4 className="text-[1.0625rem] font-bold tracking-(--tracking-heading)">{passage.heading[locale]}</h4>
                      <p className="mt-3 text-[0.9375rem] leading-[1.8] text-secondary">
                        {passage.before[locale]}{" "}
                        {cited ? (
                          <mark
                            className="mark-evidence"
                            data-active={passage.id === selectedPassageId || undefined}
                          >
                            {passage.evidence[locale]}
                          </mark>
                        ) : (
                          passage.evidence[locale]
                        )}{" "}
                        {passage.after[locale]}
                      </p>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <FileText className="size-6 text-tertiary" aria-hidden />
                <p className="max-w-[30ch] text-small text-secondary">{t("notIncluded")}</p>
              </div>
            )}
          </div>

          {pagePassages.some((p) => citedIds.has(p.id)) && (
            <p className="mt-3 flex gap-2.5 text-label leading-relaxed text-tertiary">
              <span aria-hidden className="mt-1 h-3 w-5 shrink-0 rounded-sm bg-highlight-strong" />
              {t("note")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const pagerClass =
  "inline-flex size-9 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:text-disabled";
