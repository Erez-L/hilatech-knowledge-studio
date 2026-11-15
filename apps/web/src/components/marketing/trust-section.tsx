import { FileLock2, Quote, SearchX, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";

const items = [
  { key: "private", icon: FileLock2 },
  { key: "sources", icon: Quote },
  { key: "access", icon: UsersRound },
  { key: "unsupported", icon: SearchX },
] as const;

export function TrustSection() {
  const t = useTranslations("trust");
  return (
    <section className="page-container grid gap-x-16 gap-y-12 py-(--space-section) wide:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <h2 className="type-h2 max-w-[16ch]">{t("title")}</h2>
        <p className="type-lead mt-5 max-w-[30rem]">{t("body")}</p>

        <figure className="mt-10 max-w-[30rem] rounded-panel border border-border bg-surface p-5 shadow-raised">
          <figcaption className="mb-4 text-label font-semibold text-tertiary">{t("example.label")}</figcaption>
          <p className="ms-auto w-fit max-w-[90%] rounded-panel rounded-ee-sm bg-bubble px-4 py-2.5 text-[0.9375rem] font-medium text-on-bubble">
            {t("example.question")}
          </p>
          <p className="mt-4 text-[0.9375rem] leading-relaxed">{t("example.answer")}</p>
          <p className="type-meta mt-3 text-tertiary">{t("example.meta")}</p>
        </figure>
      </div>

      <dl className="grid content-start gap-x-10 sm:grid-cols-2">
        {items.map(({ key, icon: Icon }) => (
          <div key={key} className="border-t border-border py-7">
            <dt className="flex items-center gap-3 text-[1.125rem] font-bold tracking-(--tracking-heading)">
              <Icon className="size-5 shrink-0 text-brand" aria-hidden />
              {t(`items.${key}.title`)}
            </dt>
            <dd className="mt-3 text-secondary">{t(`items.${key}.body`)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
