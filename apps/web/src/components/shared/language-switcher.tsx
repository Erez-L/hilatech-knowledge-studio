"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const target = locale === "he" ? "en" : "he";
  const label = t("otherLanguage");

  return (
    <Link
      href={pathname}
      locale={target}
      lang={target}
      hrefLang={target}
      aria-label={t("switchLanguage", { language: label })}
      className={cn(
        "inline-flex h-11 items-center rounded-control px-3 text-small font-semibold text-secondary transition-colors hover:bg-hover hover:text-foreground",
        className,
      )}
    >
      {label}
    </Link>
  );
}
