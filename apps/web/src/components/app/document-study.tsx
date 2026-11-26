"use client";

import { ArrowLeft, Highlighter, LoaderCircle, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ApiError, type DocumentContent, type SummaryView } from "@/lib/api";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useApp } from "./app-provider";
import { OpenNavigationButton } from "./app-shell";

type Range = { start: number; end: number; point: number };

/** Splits a passage into plain and highlighted runs. Overlapping highlights keep the earlier one. */
function segments(text: string, ranges: Range[]) {
  const out: { text: string; point: number | null }[] = [];
  let at = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const start = Math.max(range.start, at);
    const end = Math.min(range.end, text.length);
    if (end <= start) continue;
    if (start > at) out.push({ text: text.slice(at, start), point: null });
    out.push({ text: text.slice(start, end), point: range.point });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at), point: null });
  return out;
}

/**
 * One document with its key passages marked and a summary beside it. Every summary point is
 * tied to the marked text it rests on: choosing a point scrolls the document to that text.
 */
export function DocumentStudy({ documentId }: { documentId: string }) {
  const t = useTranslations("app.study");
  const locale = useLocale() === "he" ? "he" : "en";
  const { api, handleAuthError } = useApp();
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.documentContent(documentId, undefined, controller.signal),
      api.summary(documentId, locale, controller.signal).catch((cause) => {
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }),
    ])
      .then(([loaded, saved]) => {
        setContent(loaded);
        setSummary(saved);
        setState("ready");
      })
      .catch((cause) => {
        if (controller.signal.aborted || handleAuthError(cause)) return;
        setState("missing");
      });
    return () => controller.abort();
  }, [api, documentId, locale, handleAuthError]);

  // The chunk that carries each point's first highlight; its first run there is the scroll target.
  const anchorChunk = useMemo(() => summary?.content.points.map((point) => point.highlights[0]?.chunkId ?? null) ?? [], [summary]);

  const byChunk = useMemo(() => {
    const map = new Map<string, Range[]>();
    summary?.content.points.forEach((point, index) => {
      for (const highlight of point.highlights) {
        map.set(highlight.chunkId, [...(map.get(highlight.chunkId) ?? []), { start: highlight.start, end: highlight.end, point: index }]);
      }
    });
    return map;
  }, [summary]);

  const generate = async () => {
    setWorking(true);
    setError(null);
    try {
      setSummary(await api.summarize(documentId, locale));
      setActive(null);
    } catch (cause) {
      if (!handleAuthError(cause)) {
        const code = cause instanceof ApiError ? cause.code : "internal";
        setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.internal"));
      }
    } finally {
      setWorking(false);
    }
  };

  const goTo = (point: number) => {
    setActive(point);
    document.getElementById(`highlight-${point}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-8">
        <OpenNavigationButton />
        <Link href="/app/library" aria-label={t("back")} className="grid size-10 shrink-0 place-items-center rounded-control text-secondary hover:bg-hover hover:text-foreground">
          <ArrowLeft className="size-4.5 rtl:-scale-x-100" aria-hidden />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold" dir="auto">{content?.document.title ?? t("title")}</h1>
        {state === "ready" ? (
          <Button onClick={() => void generate()} disabled={working}>
            {working ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Highlighter className="size-4" aria-hidden />}
            {working ? t("working") : summary ? t("again") : t("start")}
          </Button>
        ) : null}
      </header>

      {state === "loading" ? (
        <p className="p-8 text-small text-secondary">{t("loading")}</p>
      ) : state === "missing" || !content ? (
        <p className="p-8 text-small text-secondary">{t("missing")}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
          <aside className="scroll-quiet min-h-0 overflow-y-auto border-b border-border p-4 sm:p-6 lg:border-e lg:border-b-0" aria-label={t("summaryLabel")}>
            <h2 className="text-label font-semibold text-tertiary">{t("summaryLabel")}</h2>
            {error ? (
              <p role="alert" className="mt-3 flex items-start gap-2 text-small text-danger">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
            {working ? <p className="mt-3 text-small text-secondary">{t("workingHint")}</p> : null}
            {summary ? (
              <>
                {summary.pipelineMode === "sample" ? <p className="mt-3 text-label font-semibold text-tertiary">{t("sample")}</p> : null}
                {/* The overview is the model's own wording; unlike the points, nothing ties it to the text. */}
                <section aria-labelledby="summary-overview" className="mt-3 rounded-control border border-dashed border-border p-3">
                  <h3 id="summary-overview" className="text-label font-semibold text-tertiary">{t("overviewLabel")}</h3>
                  <p className="mt-1.5 text-small leading-relaxed" dir="auto">{summary.content.overview}</p>
                  <p className="mt-2 text-label leading-relaxed text-tertiary">{t("overviewUnverified")}</p>
                </section>
                <ol className="mt-4 flex flex-col gap-1.5">
                  {summary.content.points.map((point, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        onClick={() => goTo(index)}
                        aria-current={active === index ? "true" : undefined}
                        className={cn(
                          "flex w-full gap-2.5 rounded-control border px-3 py-2.5 text-start text-small leading-relaxed transition-colors",
                          active === index ? "border-foreground/60 bg-surface" : "border-transparent hover:bg-hover",
                        )}
                      >
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-highlight text-[0.6875rem] font-semibold text-foreground">{index + 1}</span>
                        <span dir="auto">{point.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                {summary.content.rejectedPoints > 0 ? (
                  <p className="mt-4 flex items-start gap-2 text-label leading-relaxed text-secondary">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {t("omittedPoints", { count: summary.content.rejectedPoints })}
                  </p>
                ) : null}
                <p className="mt-4 text-label leading-relaxed text-tertiary">
                  {t("note")}
                  {summary.content.rejectedQuotes > 0 ? ` ${t("rejected", { count: summary.content.rejectedQuotes })}` : ""}
                </p>
              </>
            ) : !working ? (
              <p className="mt-3 text-small leading-relaxed text-secondary">{t("empty")}</p>
            ) : null}
          </aside>

          <article className="scroll-quiet min-h-0 overflow-y-auto p-4 sm:p-8" aria-label={t("textLabel")}>
            <div className="mx-auto flex max-w-[46rem] flex-col gap-4">
              {content.chunks.map((chunk) => {
                const first = new Set<number>();
                return (
                  <p key={chunk.id} dir="auto" className="text-body leading-(--leading-body) whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {segments(chunk.text, byChunk.get(chunk.id) ?? []).map((segment, i) => {
                      if (segment.point === null) return <span key={i}>{segment.text}</span>;
                      const anchor = !first.has(segment.point) && anchorChunk[segment.point] === chunk.id;
                      first.add(segment.point);
                      return (
                        <mark
                          key={i}
                          id={anchor ? `highlight-${segment.point}` : undefined}
                          className={cn("rounded-sm bg-highlight px-0.5 text-foreground", active === segment.point && "ring-2 ring-foreground/60")}
                        >
                          {segment.text}
                        </mark>
                      );
                    })}
                  </p>
                );
              })}
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
