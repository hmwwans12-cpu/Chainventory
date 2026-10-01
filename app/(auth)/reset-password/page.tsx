import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set your new Chainventory password.",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);
  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-foreground text-2xl font-semibold text-balance">
            {t("auth.reset_title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("auth.reset_desc")}
          </p>
        </div>

        <ResetPasswordForm />

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
