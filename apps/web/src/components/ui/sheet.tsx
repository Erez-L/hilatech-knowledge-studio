"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Sheet — a modal panel that slides in from an edge. Built on Radix Dialog
 * (focus trap, Escape, scroll lock). `side` uses logical edges so RTL works
 * without overrides.
 */
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

const sideClasses = {
  start:
    "inset-y-0 start-0 h-dvh w-[min(22rem,88vw)] border-e data-[state=open]:animate-[sheet-in-start_260ms_var(--ease-out)] data-[state=closed]:animate-[sheet-out-start_180ms_var(--ease-in-out)]",
  end: "inset-y-0 end-0 h-dvh w-[min(30rem,94vw)] border-s data-[state=open]:animate-[sheet-in-end_260ms_var(--ease-out)] data-[state=closed]:animate-[sheet-out-end_180ms_var(--ease-in-out)]",
  bottom:
    "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-panel border-t data-[state=open]:animate-[sheet-in-bottom_280ms_var(--ease-out)] data-[state=closed]:animate-[sheet-out-bottom_200ms_var(--ease-in-out)]",
  top: "inset-x-0 top-0 rounded-b-panel border-b data-[state=open]:animate-[sheet-in-top_260ms_var(--ease-out)] data-[state=closed]:animate-[sheet-out-top_180ms_var(--ease-in-out)]",
} as const;

type SheetContentProps = ComponentProps<typeof Dialog.Content> & {
  side?: keyof typeof sideClasses;
  title: string;
  closeLabel: string;
  hideHeader?: boolean;
  headerExtra?: ReactNode;
};

export function SheetContent({
  side = "end",
  title,
  closeLabel,
  hideHeader,
  headerExtra,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-stage/45 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_160ms_ease-in]" />
      <Dialog.Content
        aria-describedby={undefined}
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface text-foreground shadow-float outline-none",
          sideClasses[side],
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            "flex min-h-14 items-center justify-between gap-3 border-b border-border ps-5 pe-2",
            hideHeader && "sr-only",
          )}
        >
          <Dialog.Title className="text-small font-semibold">{title}</Dialog.Title>
          <div className="flex items-center gap-1">
            {headerExtra}
            <Dialog.Close
              aria-label={closeLabel}
              className="inline-flex size-11 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
