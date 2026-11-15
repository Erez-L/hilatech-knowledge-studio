import { useTranslations } from "next-intl";
import { ContactForm } from "./contact-form";

export function ContactSection() {
  const t = useTranslations("contact");
  return (
    <section id="contact" className="bg-stage text-on-stage">
      <div className="page-container grid gap-x-16 gap-y-10 py-(--space-section) wide:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <h2 className="type-h2 max-w-[18ch]">{t("title")}</h2>
          <p className="type-lead mt-5 max-w-[30rem] text-on-stage-muted!">{t("body")}</p>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
