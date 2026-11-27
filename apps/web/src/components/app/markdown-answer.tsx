"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CitationChip } from "@/components/shared/citation-chip";

type Props = {
  /** Model output: plain text with a small Markdown subset and validated [S1] markers. */
  content: string;
  /** label → display number. A marker whose label is not here is not rendered. */
  numbers: Record<string, number>;
  activeLabel?: string | null;
  onCite?: (label: string) => void;
  citationLabel: (label: string, number: number) => string;
  className?: string;
};

/**
 * Renders an answer safely. The text is parsed into a fixed set of elements
 * (paragraphs, headings, lists, tables, code); nothing in it is ever treated
 * as HTML, so model output cannot inject markup or scripts.
 */
export function MarkdownAnswer({ content, numbers, activeLabel, onCite, citationLabel, className }: Props) {
  const inline = (text: string): ReactNode[] =>
    text.split(/(\[S\d{1,3}\]|`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
      const cite = part.match(/^\[(S\d{1,3})\]$/)?.[1];
      if (cite) {
        const number = numbers[cite];
        if (number === undefined) return null;
        return (
          <CitationChip
            key={index}
            number={number}
            active={activeLabel === cite}
            aria-label={citationLabel(cite, number)}
            onClick={() => onCite?.(cite)}
          />
        );
      }
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={index} dir="ltr" className="type-meta rounded bg-sunken px-1.5 py-0.5 text-[0.85em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
      return <Fragment key={index}>{part}</Fragment>;
    });

  const blocks: ReactNode[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const isRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  const listItem = (line: string) => line.match(/^\s*(?:([-*•])|(\d{1,3})[.)])\s+(.*)$/);

  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!;
    const key = blocks.length;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key} dir="ltr" className="scroll-quiet overflow-x-auto rounded-control border border-border bg-sunken p-4 text-start">
          <code className="type-meta text-[0.8125rem] leading-relaxed">{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <h4 key={key} dir="auto" className="mt-1 text-[1.0625rem] font-bold tracking-(--tracking-heading)">
          {inline(heading[2]!)}
        </h4>,
      );
      i++;
      continue;
    }
    if (isRow(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]!) && lines[i + 1]!.includes("-")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isRow(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push(
        <div key={key} className="scroll-quiet overflow-x-auto rounded-control border border-border">
          <table className="w-full min-w-[24rem] border-collapse text-small">
            <thead>
              <tr className="bg-sunken">
                {head.map((cell, c) => (
                  <th key={c} scope="col" dir="auto" className="px-4 py-2.5 text-start font-semibold">
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-t border-border">
                  {row.map((cell, c) => (
                    <td key={c} dir="auto" className={cn("px-4 py-2.5 text-start align-top", c === 0 && "font-medium text-secondary")}>
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const first = listItem(line);
    if (first) {
      const ordered = Boolean(first[2]);
      // Keep the numbers as written: "7. Response targets" must not be shown as "1.".
      const items: { text: string; number: string | null }[] = [];
      while (i < lines.length) {
        const item = listItem(lines[i]!);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push({ text: item[3]!, number: item[2] ?? null });
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className="flex flex-col gap-2.5">
          {items.map((item, n) => (
            <li key={n} dir="auto" value={item.number ? Number(item.number) : undefined} className={cn("relative", ordered ? "ps-8" : "ps-6")}>
              {ordered ? (
                <span aria-hidden className="type-meta absolute start-0 top-[0.3em] text-tertiary">
                  {item.number}.
                </span>
              ) : (
                <span aria-hidden className="absolute start-0 top-[0.72em] h-px w-2.5 bg-border-strong" />
              )}
              {inline(item.text)}
            </li>
          ))}
        </List>,
      );
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*(```|#{1,6}\s)/.test(lines[i]!) && !listItem(lines[i]!) && !(isRow(lines[i]!) && paragraph.length === 0)) {
      paragraph.push(lines[i++]!);
    }
    if (paragraph.length === 0) paragraph.push(lines[i++]!); // a lone table-like line: show it as text
    blocks.push(
      <p key={key} dir="auto">
        {inline(paragraph.join(" "))}
      </p>,
    );
  }

  // Each block takes its direction from its own first words (dir="auto" per block), so a Hebrew
  // paragraph after an English one, or one that starts with an English name, still reads right to left.
  // The wrapper keeps the page's direction for the layout of tables and lists.
  return (
    <div className={cn("flex flex-col gap-4 text-body leading-(--leading-body) [overflow-wrap:anywhere]", className)}>
      {blocks}
    </div>
  );
}
