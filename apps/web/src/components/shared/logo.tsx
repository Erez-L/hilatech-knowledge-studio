import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

/**
 * Brand mark: a document page with one line highlighted — the product's whole
 * idea in a glyph. Never mirrored in RTL (it is a brand graphic).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={cn("size-7 shrink-0", className)} aria-hidden>
      <rect x="4.5" y="2.5" width="19" height="23" rx="2.5" fill="var(--logo-page)" />
      <rect x="8" y="8" width="12" height="1.75" rx="0.875" fill="#ffffff" opacity="0.55" />
      <rect x="6.5" y="12" width="15" height="4" rx="1" fill="var(--lime-400)" />
      <rect x="8" y="18.25" width="8" height="1.75" rx="0.875" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}

export function Logo({
  className,
  compact,
  tone = "default",
}: {
  className?: string;
  compact?: boolean;
  tone?: "default" | "stage";
}) {
  const t = useTranslations("common");
  return (
    <span
      dir="ltr"
      className={cn("inline-flex items-center gap-2.5", tone === "stage" && "[--logo-page:#2f4a44]", className)}
    >
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[0.9375rem] font-extrabold tracking-[-0.02em]">{t("brandPrimary")}</span>
        {!compact && (
          <span
            className={cn(
              "mt-1 text-[0.75rem] font-medium tracking-[0.01em]",
              tone === "stage" ? "text-on-stage-muted" : "text-secondary",
            )}
          >
            {t("brandSecondary")}
          </span>
        )}
      </span>
    </span>
  );
}
