import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/shared/logo";

export function MarketingFooter() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  const links = [
    { label: nav("product"), href: "#product" },
    { label: nav("how"), href: "#how-it-works" },
    { label: nav("useCases"), href: "#use-cases" },
    { label: nav("contact"), href: "#contact" },
  ];
  return (
    <footer className="bg-stage text-on-stage">
      <div className="page-container border-t border-stage-border py-12">
        <div className="flex flex-col justify-between gap-10 lg:flex-row">
          <div className="max-w-[26rem]">
            <Logo tone="stage" />
            <p className="mt-5 text-[1.0625rem] font-semibold">{t("tagline")}</p>
          </div>
          <nav aria-label={t("navLabel")}>
            <ul className="flex flex-wrap gap-x-8 gap-y-3 text-small font-semibold">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-on-stage-muted transition-colors hover:text-on-stage">
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/demo" className="text-on-stage-muted transition-colors hover:text-on-stage">
                  {nav("demo")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-stage-border pt-6 text-label text-on-stage-muted sm:flex-row">
          <p className="max-w-[44rem]">{t("disclosure")}</p>
          <p className="ltr-run shrink-0">{t("rights", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
