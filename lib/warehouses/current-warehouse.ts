import type { Role } from "@/lib/auth/permissions";
import type { SupabaseClient } from "@/lib/api-handler";

/**
 * Warehouse context untuk halaman dashboard.
 *
 * App saat ini tanpa switcher global; setiap halaman perlu tahu warehouse
 * aktif. Helper ini membaca seluruh membership ACTIVE user + ringkasan
 * warehouse (view `warehouse_summaries`, member-readable pasca 0012), lalu
 * `pickActiveWarehouse` memilih dari query param `?warehouse=` atau default
 * ke membership paling awal. Server tetap satu-satunya sumber: RLS memfilter
 * sendiri, dan view tidak mengekspos kolom identitas owner.
 */

export type WarehouseSummary = {
  id: string;
  name: string;
  code: string;
  contractAddress: string | null;
  role: Role;
  joinedAt: string;
  status: "active" | "suspended";
  lastActivityAt: string;
};

export async function getMyWarehouses(
  supabase: SupabaseClient,
  userId: string
): Promise<WarehouseSummary[]> {
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("warehouse_id, role, status, joined_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("joined_at", { ascending: true });

  if (error || !memberships || memberships.length === 0) return [];

  const ids = memberships.map((m) => m.warehouse_id);
  const { data: warehouses } = await supabase
    .from("warehouse_summaries")
    .select(
      "id, name, warehouse_code, contract_address, status, last_activity_at"
    )
    .in("id", ids);

  const byId = new Map((warehouses ?? []).map((w) => [w.id, w]));
  const list: WarehouseSummary[] = [];
  for (const m of memberships) {
    const warehouse = byId.get(m.warehouse_id);
    if (!warehouse) continue;
    list.push({
      id: m.warehouse_id,
      name: warehouse.name,
      code: warehouse.warehouse_code,
      contractAddress: warehouse.contract_address,
      role: m.role as Role,
      joinedAt: m.joined_at,
      status: warehouse.status as WarehouseSummary["status"],
      lastActivityAt: warehouse.last_activity_at,
    });
  }
  return list;
}

export function pickActiveWarehouse(
  warehouses: WarehouseSummary[],
  param?: string
): WarehouseSummary | undefined {
  if (warehouses.length === 0) return undefined;
  if (param) return warehouses.find((w) => w.id === param) ?? warehouses[0];
  return warehouses[0];
}
