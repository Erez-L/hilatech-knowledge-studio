"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const target = locale === "he" ? "en" : "he";
  const label = t("otherLanguage");

  // Keep the query, so an open conversation (?c=…) stays open in the other language. It is read
  // at click time: the workspace updates the address itself when a new conversation starts.
  const keepQuery = (event: MouseEvent<HTMLAnchorElement>) => {
    const search = window.location.search;
    if (!search || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.replace(`${pathname}${search}`, { locale: target });
  };

  return (
    <Link
      href={pathname}
      locale={target}
      lang={target}
      hrefLang={target}
      onClick={keepQuery}
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
