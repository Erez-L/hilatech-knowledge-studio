import { useTranslations } from "next-intl";

const items = ["support", "hr", "ops", "docs"] as const;

export function UseCases() {
  const t = useTranslations("useCases");
  return (
    <section id="use-cases" className="border-y border-border bg-surface">
      <div className="page-container py-(--space-section)">
        <div className="grid gap-4 wide:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] wide:items-end">
          <h2 className="type-h2 max-w-[20ch]">{t("title")}</h2>
          <p className="type-lead max-w-[32rem]">{t("body")}</p>
        </div>

        <div className="mt-14">
          <div aria-hidden className="hidden grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 pb-3 text-label font-semibold text-tertiary lg:grid">
            <span>{t("teamHeader")}</span>
            <span>{t("questionHeader")}</span>
          </div>
          <ul>
            {items.map((key) => (
              <li
                key={key}
                className="group grid gap-x-8 gap-y-5 border-t border-border py-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:py-10"
              >
                <div>
                  <h3 className="type-h3">{t(`items.${key}.team`)}</h3>
                  <p className="mt-2 max-w-[40ch] text-secondary">{t(`items.${key}.body`)}</p>
                </div>
                <p className="text-[clamp(1.25rem,1rem+1.1vw,1.875rem)] leading-[1.25] font-semibold tracking-(--tracking-heading)">
                  <span className="mark-evidence bg-size-[0%_100%]! transition-[background-size] duration-500 ease-out group-hover:bg-size-[100%_100%]!">
                    {t(`items.${key}.question`)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
