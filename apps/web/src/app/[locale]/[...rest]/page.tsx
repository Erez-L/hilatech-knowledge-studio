import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

// Any unknown path inside a locale renders the localized not-found page. The locale is set for
// this request first, so the not-found page is rendered on the server in that language, inside
// the locale layout (with lang and dir), rather than only after the client script runs.
export default async function CatchAll({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  notFound();
}
