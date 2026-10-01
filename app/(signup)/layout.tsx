import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export default async function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialLocale = await getLocale();
  const t = (key: string) => translate(initialLocale, key);
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <AuthSplitShell
        headline={t("auth.split_signup_headline")}
        subcopy={t("auth.split_signup_sub")}
        skipLabel={t("auth.split_signup_skip")}
      >
        {children}
      </AuthSplitShell>
    </LocaleProvider>
  );
}
