import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <main className="ruled-ground flex min-h-dvh flex-col">
      <div className="page-container flex h-18 items-center">
        <Link href="/" className="rounded-control">
          <Logo />
        </Link>
      </div>
      <div className="page-container flex flex-1 flex-col justify-center pb-24">
        <p className="type-meta text-tertiary">404</p>
        <h1 className="type-h2 mt-3 max-w-[16ch]">{t("title")}</h1>
        <p className="type-lead mt-4 max-w-[32rem]">{t("body")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">{t("home")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/demo">{t("demo")}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
