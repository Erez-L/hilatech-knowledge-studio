"use client";

import { ArrowUp, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

type ChatComposerProps = {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

const MAX_LENGTH = 2000;

export function ChatComposer({ busy, onSend, onStop }: ChatComposerProps) {
  const t = useTranslations("workspace.composer");
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !busy;

  // Auto-resize up to a comfortable maximum, then scroll inside the field.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mx-auto w-full max-w-[46rem]"
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-panel border border-border-strong bg-surface p-2 ps-4 shadow-raised",
          "transition-[border-color,box-shadow] duration-150",
          "focus-within:border-foreground/70 focus-within:ring-4 focus-within:ring-accent/45",
        )}
      >
        <label htmlFor={id} className="sr-only">
          {t("label")}
        </label>
        <textarea
          id={id}
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          dir="auto"
          enterKeyHint="send"
          className="scroll-quiet min-h-11 flex-1 resize-none bg-transparent py-2.5 text-body leading-normal outline-none placeholder:text-tertiary"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t("stop")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-on-primary transition-[background-color,transform] duration-150 hover:bg-primary-hover active:scale-95"
          >
            <Square className="size-4 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label={t("send")}
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-control transition-[background-color,color,transform] duration-150 active:scale-95",
              canSend ? "bg-accent text-on-accent hover:bg-accent-hover" : "bg-hover text-disabled",
            )}
          >
            <ArrowUp className="size-5" aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-2 hidden items-center justify-center gap-1.5 text-label text-tertiary md:flex" aria-hidden>
        <kbd className={kbdClass}>Enter</kbd>
        {t("hintSend")}
        <span className="mx-1.5 h-3 w-px bg-border-strong" />
        <kbd className={kbdClass}>Shift</kbd>
        <kbd className={kbdClass}>Enter</kbd>
        {t("hintNewline")}
      </p>
    </form>
  );
}

const kbdClass =
  "type-meta inline-flex h-5 items-center rounded border border-border-strong bg-surface px-1.5 text-[0.6875rem] text-secondary";
