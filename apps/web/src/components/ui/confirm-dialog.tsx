"use client";

import { LoaderCircle } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./button";

/**
 * A modal question before an action that cannot be undone or that costs something. Escape, the
 * overlay and Cancel close it, except while the action runs. Focus moves into the dialog and
 * returns to the control that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busyLabel,
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busyLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-stage/45 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-border bg-surface p-6 shadow-float outline-none data-[state=open]:animate-[fade-in_200ms_ease-out]">
          <Dialog.Title className="text-[1.25rem] font-bold tracking-(--tracking-heading)">{title}</Dialog.Title>
          <Dialog.Description dir="auto" className="mt-3 text-secondary [overflow-wrap:anywhere]">
            {body}
          </Dialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button variant="outline" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
              {busy && <LoaderCircle className="animate-spin" aria-hidden />}
              {busy && busyLabel ? busyLabel : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
