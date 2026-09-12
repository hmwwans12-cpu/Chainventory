import Link from "next/link";
import { Boxes, ShieldCheck, Users, Zap } from "lucide-react";

import { APP_NAME } from "@/lib/constants";

/**
 * Shell split-screen auth (referensi Stitch `*_split_screen`): panel brand
 * kiri (deep-green + dot pattern + headline + 3 stats) dan panel form kanan
 * di atas kartu putih. Dipakai grup (signup) & (login) dengan copy
 * masing-masing — rute (auth) lain (forgot/reset/onboarding) tidak tersentuh.
 *
 * Logo kiri digambar inline (varian putih) — komponen <Logo /> milik bersama
 * tidak disentuh (dipakai sidebar di atas background terang, NFE-01).
 */
const BRAND_POINTS = [
  { icon: ShieldCheck, text: "100% — every movement anchored" },
  { icon: Users, text: "5 roles — enforced server-side" },
  { icon: Zap, text: "<1 day — average team onboarding" },
];

export function AuthSplitShell({
  headline,
  subcopy,
  skipLabel,
  children,
}: {
  headline: string;
  subcopy: string;
  skipLabel: string;
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="bg-dawn-pink flex min-h-dvh flex-col md:flex-row">
      <a
        href="#auth-main"
        className="bg-primary text-primary-foreground sr-only rounded-lg px-4 py-2 text-sm font-medium focus-visible:not-sr-only"
      >
        {skipLabel}
      </a>

      {/* Panel brand — desktop only (mobile langsung ke form). */}
      <aside
        aria-label={`${APP_NAME} overview`}
        className="bg-primary text-primary-foreground relative hidden w-[45%] flex-col justify-between overflow-hidden p-8 md:flex lg:p-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgb(255 255 255 / 0.14) 1.2px, transparent 1.2px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg border border-white/25 bg-white/10">
            <Boxes aria-hidden="true" className="size-5 shrink-0" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            {APP_NAME}
          </span>
        </div>

        <div className="relative flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <p className="font-display max-w-md text-4xl leading-tight font-bold text-balance lg:text-[2.75rem]">
              {headline}
            </p>
            <p className="text-primary-foreground/80 max-w-md leading-relaxed">
              {subcopy}
            </p>
          </div>
          <ul className="flex flex-col gap-5">
            {BRAND_POINTS.map((point) => (
              <li key={point.text} className="flex items-center gap-3.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10">
                  <point.icon aria-hidden="true" className="size-5 shrink-0" />
                </span>
                <span className="text-[15px] font-semibold">
                  {point.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-primary-foreground/80 relative flex items-center gap-2 text-sm">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
          No crypto knowledge needed.
        </p>
      </aside>

      {/* Panel form */}
      <div className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 md:min-h-0 lg:p-10">
        <main
          id="auth-main"
          tabIndex={-1}
          className="bg-card w-full max-w-md rounded-2xl border p-6 shadow-(--shadow-card) outline-none sm:p-8"
        >
          {children}
        </main>
        <footer className="text-muted-foreground mt-6 text-sm">
          {"\u00A9"} {year} {APP_NAME}.{" "}
          <Link
            href="/"
            className="hover:text-foreground underline underline-offset-2"
          >
            Back to home
          </Link>
        </footer>
      </div>
    </div>
  );
}
