import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export default async function NotFound() {
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-6 sm:px-6">
        <Logo homeLabel={t("brand.home_aria", { app: APP_NAME })} />
        <Button variant="outline" render={<Link href="/login" />}>
          {t("marketing.nav_login")}
        </Button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <p className="font-display text-primary text-sm font-semibold tracking-wide uppercase">
          {t("common.not_found_eyebrow")}
        </p>
        <h1 className="font-display text-foreground max-w-xl text-3xl font-semibold sm:text-4xl">
          {t("common.not_found_title")}
        </h1>
        <p className="text-muted-foreground max-w-md text-base">
          {t("common.not_found_desc")}
        </p>
        <Button render={<Link href="/" />}>{t("common.not_found_cta")}</Button>
      </main>
    </div>
  );
}
