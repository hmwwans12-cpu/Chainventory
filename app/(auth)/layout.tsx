import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { APP_NAME } from "@/lib/constants";

/**
 * Auth shell mengikuti blok resmi shadcn `login-03`:
 * latar bg-muted terpusat, logo di atas kartu, kartu max-w-sm.
 * Logika autentikasi ada di server actions / form components.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="bg-muted flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Link href="/" aria-label="Go to homepage">
          <Logo />
        </Link>
      </div>
      <div className="bg-card w-full max-w-sm rounded-lg border p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        {"\u00A9"} {year} {APP_NAME}.{" "}
        <Link
          href="/"
          className="hover:text-foreground underline underline-offset-2"
        >
          Back to home
        </Link>
      </p>
    </div>
  );
}
