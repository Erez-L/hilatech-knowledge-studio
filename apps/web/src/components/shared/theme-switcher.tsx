"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

const subscribe = () => () => {};

export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";

  const toggle = () => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    setTheme(isDark ? "light" : "dark");
    window.setTimeout(() => root.classList.remove("theme-switching"), 360);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t("themeToLight") : t("themeToDark")}
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover hover:text-foreground",
        className,
      )}
    >
      <Sun
        aria-hidden
        className={cn(
          "absolute size-5 transition-[opacity,rotate,scale] duration-300 ease-out",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0",
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          "absolute size-5 transition-[opacity,rotate,scale] duration-300 ease-out",
          isDark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
    </button>
  );
}
