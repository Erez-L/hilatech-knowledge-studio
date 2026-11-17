import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/shared/logo";

/** `standalone`: see MarketingHeader. */
export function MarketingFooter({ standalone = false }: { standalone?: boolean }) {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");
  const locale = useLocale();
  const base = standalone ? `/${locale}` : "";
  const links = [
    { label: nav("product"), href: `${base}#product` },
    { label: nav("how"), href: `${base}#how-it-works` },
    { label: nav("useCases"), href: `${base}#use-cases` },
    { label: nav("contact"), href: `${base}#contact` },
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
              <li>
                <Link href="/help" className="text-on-stage-muted transition-colors hover:text-on-stage">
                  {nav("help")}
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
