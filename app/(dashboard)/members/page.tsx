import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { embedOne } from "@/lib/inventory/types";
import { RetryErrorState } from "@/components/shared/retry-error-state";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { MembersPage } from "@/components/members/members-page";
import type { MemberListItem, PendingJoinRequest } from "@/lib/members/types";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function MembersPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string | string[] }>;
}) {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const warehouseParam =
    typeof params.warehouse === "string" ? params.warehouse : undefined;

  const warehouses = await getMyWarehouses(supabase, user.id);
  const active = pickActiveWarehouse(warehouses, warehouseParam);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("nav./members")}
          description={t("members.page_desc")}
        />
        <NoWarehouse description={t("members.empty_desc")} />
      </div>
    );
  }

  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, user_id, role, status, joined_at, users(id, email, display_name, avatar_url)"
    )
    .eq("warehouse_id", active.id)
    .order("joined_at", { ascending: true });

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("nav./members")}
          description={t("members.team_suffix", { name: active.name })}
        />
        <RetryErrorState
          icon="users"
          title={t("members.load_failed_title")}
          description={t("members.load_failed_desc")}
        />
      </div>
    );
  }

  const members: MemberListItem[] = (data ?? []).map((row) => {
    const profile = embedOne<{ email: string; display_name: string | null }>(
      row.users
    );
    return {
      membershipId: row.id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? t("members.unknown"),
    };
  });

  // Pending join requests (tabel `join_requests`, bukan memberships —
  // `request_join` hanya menulis di situ). RLS `join_requests_select_admin`
  // mengizinkan member ACTIVE membaca baris pending warehouse ini; filter
  // siapa yang boleh approve/reject dilakukan di UI via permission matrix.
  // Audit v0.3.0 §2.11: tanpa hint FK agar PostgREST auto-detect; nama
  // constraint `join_requests_user_id_fkey` rapuh terhadap rename migration.
  // APP-17: error join_requests JANGAN ditelan — pending approvals yang
  // hilang diam-diam berarti request tak pernah di-approve.
  const { data: pendingRows, error: pendingError } = await supabase
    .from("join_requests")
    .select("id, user_id, created_at, users(id, email, display_name)")
    .eq("warehouse_id", active.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const pendingRequests: PendingJoinRequest[] = (pendingRows ?? []).map(
    (row) => {
      const profile = embedOne<{ email: string; display_name: string | null }>(
        row.users
      );
      return {
        requestId: row.id,
        userId: row.user_id,
        displayName: profile?.display_name ?? null,
        email: profile?.email ?? t("members.unknown"),
        requestedAt: row.created_at,
      };
    }
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("nav./members")}
        description={t("members.team_desc", { name: active.name })}
      />
      {pendingError ? (
        <p
          role="alert"
          className="border-status-warn-border bg-status-warn-bg text-status-warn-fg rounded-xl border px-4 py-3 text-sm"
        >
          {t("members.pending_failed")}
        </p>
      ) : null}
      <MembersPage
        warehouseId={active.id}
        warehouses={warehouses}
        role={active.role}
        myUserId={user.id}
        inviteCode={active.code}
        members={members}
        pendingRequests={pendingRequests}
      />
    </div>
  );
}
