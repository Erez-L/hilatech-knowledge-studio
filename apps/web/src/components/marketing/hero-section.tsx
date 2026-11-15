import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "./hero-visual";

export function HeroSection() {
  const t = useTranslations("hero");
  return (
    <section className="relative">
      <div aria-hidden className="ruled-ground absolute inset-0 -top-18 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="page-container relative grid items-center gap-x-12 gap-y-14 pt-12 pb-(--space-section) sm:pt-16 wide:grid-cols-[minmax(0,13fr)_minmax(0,12fr)] wide:pt-20">
        <div className="max-w-[40rem]">
          <h1 className="type-display">{t("title")}</h1>
          <p className="type-lead mt-6 max-w-[34rem]">{t("body")}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/demo">{t("primary")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#product">{t("secondary")}</a>
            </Button>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
