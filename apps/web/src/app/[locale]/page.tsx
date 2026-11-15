import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { ContactSection } from "@/components/marketing/contact-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ProductPreview } from "@/components/marketing/product-preview";
import { TrustSection } from "@/components/marketing/trust-section";
import { UseCases } from "@/components/marketing/use-cases";

export default function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("common");

  return (
    <>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-control focus-visible:bg-primary focus-visible:px-4 focus-visible:py-3 focus-visible:font-semibold focus-visible:text-on-primary"
      >
        {t("skipToContent")}
      </a>
      <MarketingHeader />
      <main id="main">
        <HeroSection />
        <ProductPreview />
        <HowItWorks />
        <UseCases />
        <TrustSection />
        <ContactSection />
      </main>
      <MarketingFooter />
    </>
  );
}
