import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your Chainventory password.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  return (
    <AuthShell
      homeLabel={t("brand.home_aria", { app: APP_NAME })}
      skipLabel={t("auth.skip_auth_form")}
      backLabel={t("auth.back_home")}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-foreground text-2xl font-semibold text-balance">
            {t("auth.forgot_title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("auth.forgot_desc")}
          </p>
        </div>

        <ForgotPasswordForm />

        <div className="border-border border-t pt-4 text-center text-sm">
          <p className="text-muted-foreground">
            {t("auth.remember")}{" "}
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
            >
              {t("auth.login_link")}
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
