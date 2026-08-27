import { Suspense } from "react";
import { cookies } from "next/headers";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { PageTransition } from "@/components/shared/page-transition";
import { createClient } from "@/lib/supabase/server";
import { getMyWarehouses } from "@/lib/warehouses/current-warehouse";
import { isDeveloperAllowed } from "@/lib/console/guard";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandMenu } from "@/components/shared/command-menu";
import { LocaleProvider } from "@/components/providers/locale-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // State sidebar dipersist di cookie (pola resmi shadcn sidebar kit).
  const cookieStore = await cookies();
  const sidebarState = cookieStore.get("sidebar_state");
  const defaultOpen = sidebarState ? sidebarState.value === "true" : true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Link Developer Console hanya untuk allowlist email (nav = discoverability
  // saja; guard server-side tetap autoritatif di /console & /api/console/*).
  const isDeveloper = user
    ? isDeveloperAllowed({ emails: [user.email ?? ""], wallets: [] })
    : false;

  // Data header: nama halaman warehouse (breadcrumb) + identitas user.
  const [profileRes, warehouses] = await Promise.all([
    user
      ? supabase
          .from("users")
          .select("display_name, email")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null } as { data: unknown }),
    user ? getMyWarehouses(supabase, user.id) : Promise.resolve([]),
  ]);

  const profile = profileRes.data as {
    display_name: string | null;
    email: string | null;
  } | null;

  return (
    <LocaleProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <Suspense fallback={null}>
        <AppSidebar
          warehouses={warehouses ?? []}
          user={
            user
              ? {
                  name: profile?.display_name ?? null,
                  email: profile?.email ?? user.email ?? null,
                }
              : null
          }
          isDeveloper={isDeveloper}
        />
      </Suspense>
      <SidebarInset id="main-content">
        <Suspense fallback={<div className="h-14 shrink-0 border-b" />}>
          <SiteHeader
            warehouses={(warehouses ?? []).map((w) => ({
              id: w.id,
              name: w.name,
            }))}
            user={
              user
                ? {
                    name: profile?.display_name ?? null,
                    email: profile?.email ?? user.email ?? null,
                  }
                : null
            }
          />
        </Suspense>
        <main className="bg-muted/30 flex-1">
          {/* Skeleton resmi dashboard-01: container query scope + ritme halaman.
              max-w 1600px: konten dashboard tidak meregang tak terbatas di
              ultrawide (konsistensi visual, temuan audit UI #9). */}
          <div className="@container/main mx-auto w-full max-w-[1600px] px-4 py-4 md:px-6 md:py-6">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </SidebarInset>
      <CommandMenu />
      </SidebarProvider>
    </LocaleProvider>
  );
}
