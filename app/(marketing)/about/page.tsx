import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export const metadata: Metadata = {
  title: "About",
  description:
    "Chainventory is modern inventory management software with blockchain verification, built to feel like a normal SaaS, with trust layered underneath.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const locale = await getLocale();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
      <PageHeader
        title={translate(locale, "about.page_title")}
        description={translate(locale, "about.page_desc")}
      />
      <div className="text-muted-foreground flex flex-col gap-4 text-base leading-relaxed">
        <p>{translate(locale, "about.body_1")}</p>
        <p>{translate(locale, "about.body_2")}</p>
        <p>{translate(locale, "about.body_3")}</p>
      </div>
    </div>
  );
}
