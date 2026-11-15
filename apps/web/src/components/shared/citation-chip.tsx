"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type CitationChipProps = Omit<ComponentProps<"button">, "children"> & {
  number: number;
  active?: boolean;
  tone?: "default" | "stage";
};

/** Inline citation marker. The number always maps to a real source in the list. */
export function CitationChip({ number, active, tone = "default", className, ...props }: CitationChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-active={active || undefined}
      className={cn(
        "type-meta relative mx-1 inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 align-[0.12em] font-medium",
        "transition-[background-color,border-color,color,transform] duration-150 ease-out hover:-translate-y-px",
        // Enlarged hit area without changing the inline layout.
        "after:absolute after:-inset-2 after:content-['']",
        tone === "default"
          ? "border-border-strong bg-surface text-secondary hover:border-foreground/50 hover:bg-highlight hover:text-foreground"
          : "border-stage-border bg-stage-raised text-on-stage-muted hover:border-on-stage-muted hover:text-on-stage",
        active && "border-transparent! bg-accent! text-on-accent!",
        className,
      )}
      {...props}
    >
      {number}
    </button>
  );
}
