"use client";

import { Fragment } from "react";
import type { AnswerBlock, Inline } from "@/sample/northstar";
import { cn } from "@/lib/cn";
import { CitationChip } from "./citation-chip";

type AnswerBlocksProps = {
  blocks: AnswerBlock[];
  /** Passage id → citation number, in order of first appearance. */
  numbers: Record<string, number>;
  activeId?: string | null;
  onCite?: (passageId: string) => void;
  citationLabel: (passageId: string, number: number) => string;
  tone?: "default" | "stage";
  className?: string;
  /** Render only the first N blocks (used while an answer is being revealed). */
  visibleBlocks?: number;
};

/**
 * Renders a structured answer. Content is a typed block tree — never HTML —
 * so nothing model- or fixture-provided is injected as markup.
 */
export function AnswerBlocks({
  blocks,
  numbers,
  activeId,
  onCite,
  citationLabel,
  tone = "default",
  className,
  visibleBlocks,
}: AnswerBlocksProps) {
  const renderInlines = (inlines: Inline[]) =>
    inlines.map((inline, index) => {
      if (typeof inline === "string") return <span key={index}>{inline}</span>;
      const number = numbers[inline.cite];
      if (number === undefined) return null; // never render a citation without a real source
      return (
        <CitationChip
          key={index}
          number={number}
          tone={tone}
          active={activeId === inline.cite}
          aria-label={citationLabel(inline.cite, number)}
          onClick={() => onCite?.(inline.cite)}
        />
      );
    });

  const shown = visibleBlocks === undefined ? blocks : blocks.slice(0, visibleBlocks);

  return (
    <div className={cn("flex flex-col gap-4 text-body leading-(--leading-body)", className)}>
      {shown.map((block, index) => {
        if (block.type === "p") {
          return (
            <p key={index} className="answer-block">
              {renderInlines(block.content)}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="answer-block flex flex-col gap-2.5">
              {block.items.map((item, i) => (
                <li key={i} className="relative ps-5">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute start-0 top-[0.72em] h-px w-2.5",
                      tone === "default" ? "bg-border-strong" : "bg-on-stage-muted",
                    )}
                  />
                  {renderInlines(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <div
            key={index}
            className={cn(
              "answer-block scroll-quiet overflow-x-auto rounded-control border",
              tone === "default" ? "border-border" : "border-stage-border",
            )}
          >
            <table className="w-full min-w-[26rem] border-collapse text-small">
              <thead>
                <tr className={tone === "default" ? "bg-sunken" : "bg-stage-raised"}>
                  {block.head.map((cell, i) => (
                    <th key={i} scope="col" className="px-4 py-2.5 text-start font-semibold">
                      {renderInlines(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className={cn("border-t", tone === "default" ? "border-border" : "border-stage-border")}>
                    {row.map((cell, i) => {
                      const Cell = i === 0 ? "th" : "td";
                      return (
                        <Cell
                          key={i}
                          {...(i === 0 ? { scope: "row" as const } : {})}
                          className={cn(
                            "px-4 py-2.5 text-start align-top",
                            i === 0
                              ? cn("font-medium", tone === "default" ? "text-secondary" : "text-on-stage-muted")
                              : "font-normal",
                          )}
                        >
                          <Fragment>{renderInlines(cell)}</Fragment>
                        </Cell>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
