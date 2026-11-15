"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import {
  citedPassageIds,
  getConversation,
  getDocument,
  getPassage,
  type AnswerBlock,
} from "@/sample/northstar";
import { cn } from "@/lib/cn";
import { AnswerBlocks } from "@/components/shared/answer-blocks";
import { SourcePage, useLocatorLabel } from "@/components/shared/source-page";

type Thread = { id: string; d: string; x: number; y: number };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Hero illustration: one question, its answer, and the two passages behind it,
 * joined by threads drawn from each citation to the highlighted text.
 * It is built from the same components as the product, not from an image.
 */
export function HeroVisual() {
  const t = useTranslations("hero");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const locatorLabel = useLocatorLabel();

  // Two statements from the sample answer: the refund window and who approves it.
  const conversation = getConversation("annual-refunds")!;
  const blocks = useMemo<AnswerBlock[]>(() => {
    const [intro, list] = conversation.answer[locale];
    const approval = list?.type === "list" ? list.items[1] : undefined;
    return [intro, approval && ({ type: "p", content: approval } as const)].filter(
      (block): block is AnswerBlock => Boolean(block),
    );
  }, [conversation, locale]);
  const ids = citedPassageIds(blocks);
  const numbers = Object.fromEntries(ids.map((id, i) => [id, i + 1]));

  const rootRef = useRef<HTMLDivElement>(null);
  const markRefs = useRef<Record<string, HTMLElement | null>>({});
  const [threads, setThreads] = useState<Thread[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const next: Thread[] = [];
    for (const holder of root.querySelectorAll<HTMLElement>("[data-thread-from]")) {
      const id = holder.dataset.threadFrom ?? "";
      const chip = holder.querySelector<HTMLElement>("button");
      const mark = markRefs.current[id];
      if (!chip || !mark) continue;
      const page = mark.closest("article");
      if (!page) continue;
      const from = chip.getBoundingClientRect();
      const to = mark.getBoundingClientRect();
      const sheet = page.getBoundingClientRect();
      const x1 = from.left + from.width / 2 - box.left;
      const y1 = from.top + from.height / 2 - box.top;
      const stacked = sheet.top > from.bottom && sheet.left < from.right && sheet.right > from.left;
      // Narrow layout: the pages sit directly below the answer. Threads would
      // have to cross the text, so the highlights carry the link on their own.
      if (stacked) continue;

      // Wide layout: threads run sideways and land on the page edge, level with the highlight.
      const toRight = sheet.left > from.left;
      const x2 = (toRight ? sheet.left : sheet.right) - box.left;
      const y2 = to.top + to.height / 2 - box.top;
      const startX = x1 + (toRight ? from.width / 2 : -from.width / 2);
      // Run level along the chip's own line to the edge of the answer card, so the
      // thread never crosses the answer text, then curve across the gap to the page.
      const card = holder.closest<HTMLElement>("[data-answer-card]")?.getBoundingClientRect();
      const edgeX = card ? (toRight ? card.right : card.left) - box.left : startX;
      const bend = Math.max(14, Math.abs(x2 - edgeX) * 0.6) * (toRight ? 1 : -1);
      const d = `M ${startX} ${y1} L ${edgeX} ${y1} C ${edgeX + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
      next.push({ id, d, x: x2, y: y2 });
    }
    setThreads(next);
  }, []);

  useIsoLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => observer.disconnect();
  }, [measure]);

  // The one orchestrated moment on the page: threads draw, highlights sweep in.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setRevealed(true), reduce ? 0 : 450);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <figure
      ref={rootRef}
      className="relative isolate"
      aria-label={t("visualLabel")}
      onPointerLeave={() => setActive(null)}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-0">
        {/* Question and answer */}
        <div className="relative z-10 flex flex-col gap-4 sm:w-[52%] sm:pt-12">
          <div className="max-w-[26rem] self-start rounded-panel rounded-es-sm bg-bubble px-5 py-4 text-on-bubble shadow-raised">
            <span className="type-meta mb-1.5 block opacity-70">{t("question")}</span>
            <p className="text-[0.9375rem] leading-normal font-medium">{conversation.question[locale]}</p>
          </div>

          <div
            data-answer-card
            className="rounded-panel border border-border bg-surface p-5 shadow-float sm:p-6"
            onFocusCapture={(event) => {
              const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-thread-from]");
              setActive(holder?.dataset.threadFrom ?? null);
            }}
            onBlurCapture={() => setActive(null)}
            onPointerOver={(event) => {
              const holder = (event.target as HTMLElement).closest<HTMLElement>("[data-thread-from]");
              if (holder) setActive(holder.dataset.threadFrom ?? null);
            }}
          >
            <span className="type-meta mb-3 block text-tertiary">{t("answer")}</span>
            <HeroAnswer
              blocks={blocks}
              numbers={numbers}
              active={active}
              onCite={setActive}
              label={(id, n) => {
                const passage = getPassage(id)!;
                const doc = getDocument(passage.documentId)!;
                return tc("citation", { n, title: doc.title[locale], locator: locatorLabel(doc, passage.locator) });
              }}
            />
          </div>
        </div>

        {/* The pages the answer came from */}
        <div className="relative flex flex-col gap-5 sm:ms-11 sm:w-[44%] sm:flex-1">
          {ids.map((id, index) => {
            const passage = getPassage(id)!;
            return (
              <SourcePage
                key={id}
                passage={passage}
                size="sm"
                active={active === id}
                sweep={revealed ? "done" : "pending"}
                markRef={(el) => {
                  markRefs.current[id] = el;
                }}
                className={cn(
                  "transition-transform duration-300 ease-out",
                  index === 0 ? "sm:rotate-1" : "sm:ms-6 sm:-rotate-[0.75deg]",
                  active === id && "sm:-translate-y-1",
                )}
              />
            );
          })}
        </div>
      </div>

      <svg className="pointer-events-none absolute inset-0 z-20 size-full overflow-visible" aria-hidden>
        {threads.map((thread) => (
          <g key={thread.id} data-active={active === thread.id || undefined} className="group">
            <path
              d={thread.d}
              pathLength={1}
              fill="none"
              strokeLinecap="round"
              className={cn(
                "stroke-foreground/45 transition-[stroke-dashoffset,stroke,stroke-width] duration-700 ease-out [stroke-dasharray:1] group-data-active:stroke-foreground",
                revealed ? "[stroke-dashoffset:0]" : "[stroke-dashoffset:1]",
              )}
              strokeWidth={active === thread.id ? 2 : 1.25}
            />
            <circle
              cx={thread.x}
              cy={thread.y}
              r={3.5}
              className={cn(
                "fill-accent stroke-foreground/60 transition-opacity delay-500 duration-300",
                revealed ? "opacity-100" : "opacity-0",
              )}
              strokeWidth={1}
            />
          </g>
        ))}
      </svg>

      <figcaption className="type-meta mt-6 text-tertiary">{t("visualNote")}</figcaption>
    </figure>
  );
}

function HeroAnswer({
  blocks,
  numbers,
  active,
  onCite,
  label,
}: {
  blocks: AnswerBlock[];
  numbers: Record<string, number>;
  active: string | null;
  onCite: (id: string) => void;
  label: (id: string, n: number) => string;
}) {
  // Each paragraph is wrapped so the thread can find the chip that starts it.
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        const id = citedPassageIds([block])[0];
        return (
          <div key={index} data-thread-from={id}>
            <AnswerBlocks
              blocks={[block]}
              numbers={numbers}
              activeId={active}
              onCite={onCite}
              citationLabel={label}
              className="text-[0.9375rem] leading-[1.6]"
            />
          </div>
        );
      })}
    </div>
  );
}
