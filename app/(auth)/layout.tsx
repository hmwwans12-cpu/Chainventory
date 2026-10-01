import { LocaleProvider } from "@/components/providers/locale-provider";
import { getLocale } from "@/lib/i18n/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialLocale = await getLocale();
  return (
    <LocaleProvider initialLocale={initialLocale}>{children}</LocaleProvider>
  );
}
