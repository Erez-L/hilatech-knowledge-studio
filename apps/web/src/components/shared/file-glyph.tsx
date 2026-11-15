import { cn } from "@/lib/cn";

/** File-type indicator: a small page with the extension set in mono. */
export function FileGlyph({ kind, className }: { kind: "pdf" | "docx" | "txt"; className?: string }) {
  return (
    <span
      dir="ltr"
      className={cn(
        "type-meta inline-flex h-8 w-7 shrink-0 items-end justify-center rounded-paper border border-border-strong bg-paper pb-1 text-[0.5625rem] font-medium uppercase tracking-normal text-secondary",
        "[clip-path:polygon(0_0,calc(100%-7px)_0,100%_7px,100%_100%,0_100%)]",
        className,
      )}
      aria-hidden
    >
      {kind}
    </span>
  );
}
