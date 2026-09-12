import { createClient } from "@/lib/supabase/server";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getLocale } from "@/lib/i18n/server";

// FE-21: layout membaca sesi + cookie locale — wajib dynamic agar header
// tidak ter-prerender basi (tampil "Login" padahal sudah login).
export const dynamic = "force-dynamic";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authenticated = Boolean(user);
  const initialLocale = await getLocale();

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <div className="bg-canvas flex min-h-dvh flex-col">
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-lg px-4 py-2 text-sm font-medium focus-visible:not-sr-only"
        >
          Skip to content
        </a>
        <MarketingHeader authenticated={authenticated} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <MarketingFooter />
      </div>
    </LocaleProvider>
  );
}
