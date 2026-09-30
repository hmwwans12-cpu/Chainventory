import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAuthLookup } from "@/lib/supabase/auth-lookup";

/**
 * Server guard alur onboarding (FE-02).
 *
 * Sebelumnya /onboarding/* adalah Server Component tanpa guard: proteksi
 * hanya client-side ("Please sign in" + redirect saat submit 401), dan user
 * yang sudah punya warehouse bisa membuka /onboarding/create lalu gagal
 * 409 di API setelah menandatangani (buang 1x RPC prepare).
 *
 * Aturan:
 * - Belum login → /login?next=<path> (rantai ?next tetap utuh).
 * - /onboarding/create + sudah memiliki warehouse AKTIF → /dashboard
 *   (create pasti 409; cegah sebelum user menandatangani apa pun).
 * - /onboarding/join TIDAK dialihkan bila sudah punya warehouse — user
 *   boleh menjadi member di warehouse lain selain miliknya.
 */
export async function requireOnboardingUser(path: string) {
  const supabase = await createClient();
  const auth = await getAuthLookup(supabase);
  if (auth.status === "missing") {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (auth.status === "unavailable") {
    return { supabase, user: null, authUnavailable: true as const };
  }
  return { supabase, user: auth.user, authUnavailable: false as const };
}

export async function redirectIfOwnsActiveWarehouse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<void> {
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (data) redirect("/dashboard");
}
