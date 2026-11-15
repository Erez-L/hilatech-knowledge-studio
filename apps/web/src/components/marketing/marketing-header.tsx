"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const sections = [
  { key: "product", href: "#product" },
  { key: "how", href: "#how-it-works" },
  { key: "useCases", href: "#use-cases" },
  { key: "contact", href: "#contact" },
] as const;

export function MarketingHeader() {
  const t = useTranslations("nav");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        "sticky top-0 z-30 border-b border-transparent transition-[background-color,border-color,backdrop-filter] duration-200",
        "data-scrolled:border-border data-scrolled:bg-background/85 data-scrolled:backdrop-blur-md",
      )}
    >
      <div className="page-container flex h-18 items-center justify-between gap-4">
        <Link href="/" className="rounded-control">
          <Logo />
        </Link>

        <nav aria-label={t("label")} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {sections.slice(0, 3).map((item) => (
              <li key={item.key}>
                <a href={item.href} className={navLinkClass}>
                  {t(item.key)}
                </a>
              </li>
            ))}
            <li>
              <Link href="/demo" className={navLinkClass}>
                {t("demo")}
              </Link>
            </li>
            <li>
              <a href="#contact" className={navLinkClass}>
                {t("contact")}
              </a>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-1">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <ThemeSwitcher className="hidden sm:inline-flex" />
          <Link href="/sign-in" className={cn(navLinkClass, "hidden sm:inline-flex")}>
            {t("signIn")}
          </Link>
          <Button asChild className="ms-2 hidden sm:inline-flex">
            <Link href="/demo">{t("cta")}</Link>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")}>
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="top"
              title={t("menuTitle")}
              closeLabel={t("closeMenu")}
              headerExtra={
                <>
                  <LanguageSwitcher />
                  <ThemeSwitcher />
                </>
              }
            >
              <nav aria-label={t("label")} className="px-5 pt-2 pb-6">
                <ul className="flex flex-col">
                  {[...sections.slice(0, 3), { key: "contact" as const, href: "#contact" }].map((item) => (
                    <li key={item.key} className="border-b border-border">
                      <SheetClose asChild>
                        <a href={item.href} className="flex min-h-14 items-center text-[1.375rem] font-bold tracking-(--tracking-heading)">
                          {t(item.key)}
                        </a>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
                <Button asChild size="lg" className="mt-6 w-full">
                  <Link href="/demo">{t("cta")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="mt-3 w-full">
                  <Link href="/sign-in">{t("signIn")}</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

const navLinkClass =
  "inline-flex h-11 items-center rounded-control px-3 text-small font-semibold text-secondary transition-colors hover:text-foreground";
