import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export const metadata: Metadata = {
  title: "Login",
  description: "Log in to your Chainventory account.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  const rawNext = params.next;
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : undefined;
  const oauthError =
    params.error === "oauth" ? t("auth.login_oauth_error") : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold text-balance">
          {t("auth.login_title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("auth.login_desc")}</p>
      </div>

      <LoginForm initialError={oauthError} next={safeNext} />

      <div className="border-border flex flex-col gap-1.5 border-t pt-4 text-center text-sm">
        <p className="text-muted-foreground">
          {t("auth.login_no_account")}{" "}
          <Link
            href="/signup"
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
          >
            {t("auth.login_signup")}
          </Link>
        </p>
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground text-sm font-medium underline underline-offset-2"
        >
          {t("auth.login_forgot")}
        </Link>
      </div>
    </div>
  );
}
