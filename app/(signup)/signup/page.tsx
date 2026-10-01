import type { Metadata } from "next";
import Link from "next/link";
import { Boxes } from "lucide-react";

import { SignupForm } from "@/components/auth/signup-form";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your Chainventory account.",
  robots: { index: false, follow: false },
};

export default async function SignupPage() {
  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span className="border-border flex size-9 items-center justify-center rounded-lg border">
          <Boxes aria-hidden="true" className="text-primary size-5" />
        </span>
        <span className="font-display text-primary text-lg font-bold tracking-tight">
          {APP_NAME}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-3xl font-bold text-balance">
          {t("auth.signup_title")}
        </h1>
        <p className="text-muted-foreground text-[15px]">
          {t("auth.signup_desc")}
        </p>
      </div>

      <SignupForm />

      <div className="border-border flex flex-col gap-1.5 border-t pt-4 text-center text-sm">
        <p className="text-muted-foreground">
          {t("auth.signup_have_account")}{" "}
          <Link
            href="/login"
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
          >
            {t("auth.signup_login")}
          </Link>
        </p>
      </div>
    </div>
  );
}
