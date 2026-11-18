"use client";

import { ChevronDown, Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { DocumentView } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * Chooses what the next question may draw on: the whole active project (nothing selected) or
 * only the documents ticked here. The choice is sent with the question and enforced on the server.
 */
export function QuestionScope({
  documents,
  selected,
  onChange,
  disabled = false,
}: {
  documents: DocumentView[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("app.scope");
  const [open, setOpen] = useState(false);
  const ready = documents.filter((document) => document.status === "ready");
  if (ready.length < 2) return null;
  const chosen = new Set(selected.filter((id) => ready.some((document) => document.id === id)));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="mx-auto mb-2 w-full max-w-[46rem]">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-control border px-3 text-label font-semibold transition-colors",
          chosen.size ? "border-foreground/60 bg-surface text-foreground" : "border-border text-secondary hover:bg-hover hover:text-foreground",
        )}
      >
        <Filter className="size-3.5" aria-hidden />
        {chosen.size ? t("some", { count: chosen.size, total: ready.length }) : t("all", { total: ready.length })}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <fieldset className="mt-2 rounded-control border border-border bg-surface p-3">
          <legend className="sr-only">{t("legend")}</legend>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-label text-tertiary">{t("help")}</p>
            {chosen.size ? (
              <button type="button" onClick={() => onChange([])} className="shrink-0 rounded-control px-2 text-label font-semibold text-foreground hover:bg-hover">
                {t("clear")}
              </button>
            ) : null}
          </div>
          <ul className="scroll-quiet flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {ready.map((document) => (
              <li key={document.id}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-control px-2 text-small hover:bg-hover">
                  <input type="checkbox" checked={chosen.has(document.id)} onChange={() => toggle(document.id)} className="size-4 shrink-0 accent-current" />
                  <span className="min-w-0 flex-1 truncate" dir="auto">{document.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
    </div>
  );
}
