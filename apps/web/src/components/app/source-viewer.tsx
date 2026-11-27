"use client";

import { ChevronLeft, ChevronRight, Download, FileX2, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { DocumentContent, SourceView } from "@/lib/api";
import { cn } from "@/lib/cn";
import { FileGlyph } from "@/components/shared/file-glyph";
import { Button } from "@/components/ui/button";
import { useApp } from "./app-provider";

/** What the viewer is showing: a document, and optionally the cited passage inside it. */
export type ViewerTarget = {
  documentId: string;
  title: string;
  fileType: string;
  page: number | null;
  /** The chunk to highlight, when the viewer was opened from a citation. */
  chunkId: string | null;
};

type Props = {
  sources: SourceView[];
  selectedLabel: string | null;
  onSelectSource: (source: SourceView) => void;
  target: ViewerTarget | null;
  onNavigate: (target: ViewerTarget) => void;
};

const kindOf = (fileType: string | undefined) => (fileType === "pdf" || fileType === "docx" ? fileType : "txt");

export function useLocation() {
  const t = useTranslations("common");
  return (source: { pageNumber: number | null; sectionPath: string[] | null }) =>
    source.pageNumber ? t("page", { n: source.pageNumber }) : source.sectionPath?.length ? source.sectionPath.at(-1)! : null;
}

/** Removes text that a chunk repeats from the end of the previous one (in-page overlap). */
function withoutOverlap(previous: string | undefined, text: string): string {
  if (!previous) return text;
  const max = Math.min(previous.length, text.length, 400);
  for (let size = max; size >= 20; size--) {
    if (previous.endsWith(text.slice(0, size))) return text.slice(size).trimStart();
  }
  return text;
}

/**
 * The research side of the workspace: the sources behind an answer and the
 * document they were taken from. Everything shown in the document area is
 * document content fetched from the server; none of it is generated.
 */
export function SourceViewer({ sources, selectedLabel, onSelectSource, target, onNavigate }: Props) {
  const t = useTranslations("app.evidence");
  const tc = useTranslations("common");
  const tChat = useTranslations("app.chat");
  const location = useLocation();
  const selected = sources.find((s) => s.label === selectedLabel) ?? null;

  return (
    <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto p-5">
      {sources.length > 0 && (
        <section aria-labelledby="evidence-sources">
          <h3 id="evidence-sources" className="mb-3 text-label font-semibold text-tertiary">
            {t("sourcesHeading")}
          </h3>
          <ol className="flex flex-col gap-2">
            {sources.map((source) => {
              const active = source.label === selectedLabel;
              const removed = source.sourceState === "removed" || !source.documentId;
              return (
                <li key={source.label}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectSource(source)}
                    className={cn(
                      "flex w-full gap-3 rounded-control border p-3 text-start transition-[border-color,background-color] duration-150",
                      active ? "border-foreground/70 bg-surface" : "border-border bg-transparent hover:border-border-strong hover:bg-surface",
                    )}
                  >
                    <span
                      className={cn(
                        "type-meta mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border font-medium",
                        active ? "border-transparent bg-accent text-on-accent" : "border-border-strong text-secondary",
                      )}
                    >
                      {source.ordinal}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span dir="auto" className="truncate-start text-small font-semibold">
                          {source.documentTitle}
                        </span>
                        <span dir="auto" className="type-meta max-w-[45%] shrink-0 truncate text-tertiary">
                          {removed ? tChat("sourceRemoved") : location(source)}
                        </span>
                      </span>
                      {source.excerpt && (
                        <span dir="auto" className="mt-1 line-clamp-2 text-label leading-relaxed text-secondary">
                          {source.excerpt}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {selected && (selected.sourceState === "removed" || !selected.documentId) ? (
        <div role="status" className="flex flex-col items-center gap-3 rounded-control border border-border bg-surface px-6 py-10 text-center">
          <FileX2 className="size-6 text-tertiary" aria-hidden />
          <p className="text-small font-bold">{t("removedTitle")}</p>
          <p className="max-w-[34ch] text-small text-secondary">{t("removedBody", { title: selected.documentTitle ?? "" })}</p>
        </div>
      ) : target ? (
        <DocumentView key={target.documentId} target={target} onNavigate={onNavigate} pageLabel={(n, total) => (total ? tc("pageOf", { n, total }) : tc("page", { n }))} />
      ) : null}
    </div>
  );
}

function DocumentView({
  target,
  onNavigate,
  pageLabel,
}: {
  target: ViewerTarget;
  onNavigate: (target: ViewerTarget) => void;
  pageLabel: (n: number, total: number | null) => string;
}) {
  const t = useTranslations("app.evidence");
  const { api, handleAuthError } = useApp();
  const fileUrl = api.urls.file(target.documentId);
  const [mode, setMode] = useState<"text" | "image">("text");
  // Each result is stored with the request it answers; anything else on screen is "loading".
  const [result, setResult] = useState<{ key: string; status: "ready" | "error"; data: DocumentContent | null }>({ key: "", status: "ready", data: null });
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<{ key: string; status: "ready" | "error" }>({ key: "", status: "ready" });
  const markRef = useRef<HTMLElement>(null);
  const isPdf = target.fileType === "pdf";
  const page = isPdf ? (target.page ?? 1) : null;

  const requestKey = `${target.documentId}:${page ?? ""}:${attempt}`;
  const imageKey = `${target.documentId}:${page ?? ""}`;
  const state = { status: result.key === requestKey ? result.status : ("loading" as const), data: result.data };
  const imageState = image.key === imageKey ? image.status : "loading";

  useEffect(() => {
    const controller = new AbortController();
    api
      .documentContent(target.documentId, page ?? undefined, controller.signal)
      .then((data) => setResult({ key: requestKey, status: "ready", data }))
      .catch((error) => {
        if (controller.signal.aborted || handleAuthError(error)) return;
        setResult({ key: requestKey, status: "error", data: null });
      });
    return () => controller.abort();
  }, [api, target.documentId, page, requestKey, handleAuthError]);

  // Bring the cited passage into view once the text is there.
  useEffect(() => {
    if (state.status !== "ready" || mode !== "text") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    markRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [state.status, target.chunkId, mode]);

  const pageCount = state.data?.document.pageCount ?? null;
  const go = (next: number) => onNavigate({ ...target, page: next, chunkId: target.chunkId });
  const chunks = state.data?.chunks ?? [];
  // Non-PDF documents have no pages: show the cited passage with its neighbours.
  const focusIndex = chunks.findIndex((c) => c.id === target.chunkId);
  const visible = isPdf || focusIndex === -1 ? chunks : chunks.slice(Math.max(0, focusIndex - 1), focusIndex + 2);

  return (
    <section aria-labelledby="evidence-document" className="flex flex-col">
      <div className="flex items-center gap-3 rounded-t-control border border-b-0 border-border bg-surface px-3 py-2.5">
        <FileGlyph kind={kindOf(target.fileType)} />
        <h3 id="evidence-document" dir="auto" className="truncate-start flex-1 text-small font-semibold">
          {target.title}
        </h3>
        {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("download")}
          title={t("download")}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover hover:text-foreground"
        >
          <Download className="size-4.5" aria-hidden />
        </a>
        )}
      </div>

      {isPdf && (
        <div className="flex items-center justify-between gap-2 border border-border bg-sunken px-1.5 py-1">
          <button type="button" className={pagerClass} disabled={(page ?? 1) <= 1} aria-label={t("previous")} onClick={() => go((page ?? 1) - 1)}>
            <ChevronLeft className="size-4.5 rtl:-scale-x-100" aria-hidden />
          </button>
          <div className="flex items-center gap-3">
            <p className="type-meta text-secondary" aria-live="polite">
              {pageLabel(page ?? 1, pageCount)}
            </p>
            <div role="group" aria-label={t("title")} className="flex rounded-control border border-border bg-surface p-0.5">
              {(["text", "image"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-[0.4rem] px-2.5 py-1 text-label font-semibold transition-colors",
                    mode === value ? "bg-primary text-on-primary" : "text-secondary hover:text-foreground",
                  )}
                >
                  {value === "text" ? t("text") : t("pagePreview")}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={pagerClass}
            disabled={pageCount !== null && (page ?? 1) >= pageCount}
            aria-label={t("next")}
            onClick={() => go((page ?? 1) + 1)}
          >
            <ChevronRight className="size-4.5 rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      )}

      <div className={cn("paper min-h-48 rounded-t-none p-6", !isPdf && "border-t")}>
        {isPdf && mode === "image" ? (
          <div className="relative">
            {imageState === "loading" && <span className="skeleton absolute inset-0 block min-h-80" aria-hidden />}
            {imageState === "error" ? (
              <ViewerMessage icon={<TriangleAlert className="size-6 text-warning" aria-hidden />} text={t("loadFailed")} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- an authorized, per-user image; not a static asset
              <img
                key={`${target.documentId}-${page}`}
                src={api.urls.pageImage(target.documentId, page ?? 1)}
                alt={t("pageImageAlt", { n: page ?? 1, title: target.title })}
                onLoad={() => setImage({ key: imageKey, status: "ready" })}
                onError={() => setImage({ key: imageKey, status: "error" })}
                className={cn("w-full rounded-paper border border-border bg-white transition-opacity duration-200", imageState === "ready" ? "opacity-100" : "opacity-0")}
              />
            )}
          </div>
        ) : state.status === "error" ? (
          <ViewerMessage icon={<TriangleAlert className="size-6 text-warning" aria-hidden />} text={t("loadFailed")}>
            <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
              {t("retry")}
            </Button>
          </ViewerMessage>
        ) : state.status === "loading" && !state.data ? (
          <div className="flex flex-col gap-3" role="status" aria-label={t("loading")}>
            <span className="skeleton h-3 w-24" />
            <span className="skeleton h-4 w-full" />
            <span className="skeleton h-4 w-11/12" />
            <span className="skeleton h-4 w-4/5" />
            <span className="skeleton h-4 w-full" />
            <span className="skeleton h-4 w-3/5" />
          </div>
        ) : (
          <div className={cn("transition-opacity duration-150", state.status === "loading" && "opacity-50")}>
            <p className="type-meta mb-4 flex items-center gap-2 text-tertiary">
              {t("text")}
              {state.status === "loading" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
            </p>
            {visible.length === 0 ? (
              <p className="py-8 text-center text-small text-secondary">{t("noText")}</p>
            ) : (
              <div className="flex flex-col gap-4 text-[0.9375rem] leading-[1.8] text-secondary [overflow-wrap:anywhere]">
                {visible.map((chunk, index) => {
                  const text = withoutOverlap(visible[index - 1]?.text, chunk.text);
                  const cited = chunk.id === target.chunkId;
                  return (
                    <div key={chunk.id}>
                      {!isPdf && chunk.sectionPath?.length ? (
                        <p dir="auto" className="type-meta mb-1.5 text-tertiary">{chunk.sectionPath.join(" › ")}</p>
                      ) : null}
                      {/* Each passage takes its own direction: an English passage must not turn a Hebrew one left to right. */}
                      <p dir="auto" className="whitespace-pre-line">
                        {cited ? (
                          <mark ref={markRef} className="mark-evidence" data-active>
                            {text}
                          </mark>
                        ) : (
                          text
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {target.chunkId && mode === "text" && state.status === "ready" && visible.some((c) => c.id === target.chunkId) && (
        <p className="mt-3 flex gap-2.5 text-label leading-relaxed text-tertiary">
          <span aria-hidden className="mt-1 h-3 w-5 shrink-0 rounded-sm bg-highlight-strong" />
          {t("note")}
        </p>
      )}
    </section>
  );
}

function ViewerMessage({ icon, text, children }: { icon: React.ReactNode; text: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
      {icon}
      <p className="max-w-[30ch] text-small text-secondary">{text}</p>
      {children}
    </div>
  );
}

const pagerClass =
  "inline-flex size-9 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:text-disabled";
