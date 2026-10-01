import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export async function AuthShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const year = new Date().getFullYear();
  const locale = await getLocale();

  return (
    <div className="bg-muted flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <a
        href="#auth-main"
        className="bg-primary text-primary-foreground sr-only rounded-lg px-4 py-2 text-sm font-medium focus-visible:not-sr-only"
      >
        Skip to sign-in form
      </a>
      <div className="mb-8">
        <Logo
          homeLabel={translate(locale, "brand.home_aria", { app: APP_NAME })}
        />
      </div>
      <main
        id="auth-main"
        tabIndex={-1}
        className={`bg-card w-full rounded-lg border p-6 shadow-(--shadow-card) outline-none sm:p-8 ${
          wide ? "max-w-[720px]" : "max-w-sm"
        }`}
      >
        {children}
      </main>
      <footer className="text-muted-foreground mt-6 text-sm">
        {"©"} {year} {APP_NAME}.{" "}
        <Link
          href="/"
          className="hover:text-foreground underline underline-offset-2"
        >
          Back to home
        </Link>
      </footer>
    </div>
  );
}
