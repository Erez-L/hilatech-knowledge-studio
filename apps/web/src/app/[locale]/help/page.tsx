import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { use } from "react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Order of the sections on the page. The text lives in messages/<locale>.json under "help". */
const sections = ["what", "how", "demo", "asking", "reading", "noAnswer", "languages", "limits", "workspace", "privacy", "faq"] as const;
/** Sections whose points are steps in order; the others are plain lists. */
const ordered = new Set<string>(["how", "demo"]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "help" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("help");
  const common = useTranslations("common");

  return (
    <>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-control focus-visible:bg-primary focus-visible:px-4 focus-visible:py-3 focus-visible:font-semibold focus-visible:text-on-primary"
      >
        {common("skipToContent")}
      </a>
      <MarketingHeader standalone />
      <main id="main" className="page-container py-(--space-section)">
        <header className="max-w-[46rem]">
          <p className="type-meta text-tertiary">{t("eyebrow")}</p>
          <h1 className="type-h2 mt-3">{t("title")}</h1>
          <p className="type-lead mt-5">{t("lead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/demo">{t("demoCta")}</Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/${locale}#contact`}>{t("contactCta")}</a>
            </Button>
          </div>
        </header>

        <div className="mt-14 grid gap-x-16 gap-y-10 wide:grid-cols-[minmax(0,15rem)_minmax(0,46rem)]">
          <nav aria-label={t("tocLabel")} className="wide:sticky wide:top-24 wide:self-start">
            <p className="text-label font-semibold text-tertiary">{t("tocLabel")}</p>
            <ol className="mt-3 flex flex-col gap-1 text-small font-semibold">
              {sections.map((key) => (
                <li key={key}>
                  <a href={`#${key}`} className="inline-flex min-h-9 items-center text-secondary transition-colors hover:text-foreground">
                    {t(`sections.${key}.title`)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div>
            {sections.map((key) => {
              const paragraphs = t.raw(`sections.${key}.paragraphs`) as string[];
              const points = t.raw(`sections.${key}.points`) as string[];
              const List = ordered.has(key) ? "ol" : "ul";
              return (
                <section key={key} id={key} aria-labelledby={`${key}-title`} className="scroll-mt-24 border-t border-border py-9 first:border-t-0 first:pt-0">
                  <h2 id={`${key}-title`} className="text-[1.375rem] font-bold tracking-(--tracking-heading)">
                    {t(`sections.${key}.title`)}
                  </h2>
                  {paragraphs.map((text) => (
                    <p key={text} className="mt-4 leading-relaxed text-secondary">
                      {text}
                    </p>
                  ))}
                  {points.length > 0 && (
                    <List className={`mt-4 flex flex-col gap-3 ps-5 leading-relaxed text-secondary ${ordered.has(key) ? "list-decimal" : "list-disc"}`}>
                      {points.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </List>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </main>
      <MarketingFooter standalone />
    </>
  );
}
