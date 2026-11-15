import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass = cn(
  "h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-body text-foreground placeholder:text-tertiary",
  "transition-[border-color,box-shadow] duration-150 outline-none",
  "hover:border-foreground/40 focus-visible:border-foreground/70 focus-visible:ring-4 focus-visible:ring-accent/45",
  "aria-invalid:border-danger disabled:opacity-60",
);

type FieldProps = Omit<ComponentProps<"input">, "id"> & {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  trailing?: ReactNode;
  /** Email addresses and similar values stay left-to-right inside Hebrew layouts. */
  ltr?: boolean;
};

/** A labelled text input with its error and hint wired up for assistive technology. */
export function Field({ id, label, error, hint, trailing, ltr, className, ...props }: FieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-small font-semibold">
          {label}
        </label>
        {trailing}
      </div>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(inputClass, ltr && "ltr-run text-start", className)}
        {...props}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-label text-tertiary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-small font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
