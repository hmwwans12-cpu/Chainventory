import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { embedOne } from "@/lib/inventory/types";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MembersPage } from "@/components/members/members-page";
import type { MemberListItem, PendingJoinRequest } from "@/lib/members/types";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function MembersPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string | string[] }>;
}) {
  const supabase = await createClient();
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
          title="Members"
          description="Warehouse team and role-based access."
        />
        <EmptyState
          icon={Users}
          title="No warehouse yet"
          description="Create a warehouse to build your team, or join one with a warehouse code."
          primaryAction={{
            label: "Create Warehouse",
            href: "/onboarding/create",
          }}
          secondaryAction={{
            label: "Join Warehouse",
            href: "/onboarding/join",
          }}
        />
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
        <PageHeader title="Members" description={`${active.name} · team.`} />
        <ErrorState
          icon={Users}
          title="Unable to load members."
          description="Something went wrong while retrieving your team. Please try again."
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
      email: profile?.email ?? "Unknown",
    };
  });

  // Pending join requests (tabel `join_requests`, bukan memberships —
  // `request_join` hanya menulis di situ). RLS `join_requests_select_admin`
  // mengizinkan member ACTIVE membaca baris pending warehouse ini; filter
  // siapa yang boleh approve/reject dilakukan di UI via permission matrix.
  const { data: pendingRows } = await supabase
    .from("join_requests")
    .select(
      "id, user_id, created_at, users!join_requests_user_id_fkey(id, email, display_name)"
    )
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
        email: profile?.email ?? "Unknown",
        requestedAt: row.created_at,
      };
    }
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Members" description={`${active.name} · team.`} />
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
