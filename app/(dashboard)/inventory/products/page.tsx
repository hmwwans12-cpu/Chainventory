import { redirect } from "next/navigation";
import { Package } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { ProductsPage } from "@/components/inventory/products-page";
import type { ProductRow } from "@/lib/inventory/types";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function ProductsPageRoute({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
    warehouse?: string | string[];
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const warehouseParam =
    typeof params.warehouse === "string" ? params.warehouse : undefined;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const rawStatus = typeof params.status === "string" ? params.status : "";
  const normalizedStatus = rawStatus.toLowerCase();
  // Audit v0.3.0 §2.5: case-insensitive ?status= — sebelumnya "Archived"
  // (huruf besar A) silently jatuh ke default "active" tanpa indikasi.
  const statusFilter =
    normalizedStatus === "archived" || normalizedStatus === "all"
      ? normalizedStatus
      : "active";

  const warehouses = await getMyWarehouses(supabase, user.id);
  const active = pickActiveWarehouse(warehouses, warehouseParam);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Products"
          description="Manage your warehouse inventory."
        />
        <NoWarehouse />
      </div>
    );
  }

  const pageNum = Math.max(
    1,
    typeof params.page === "string" && /^\d+$/.test(params.page)
      ? Number(params.page)
      : 1
  );
  const PER_PAGE = 12;

  // Tab status sekarang benar-benar memfilter (audit: products pagination).
  const statusEq =
    statusFilter === "active"
      ? "active"
      : statusFilter === "archived"
        ? "archived"
        : undefined;

  const listQuery = supabase
    .from("products")
    .select(
      "id, sku, name, category, unit, status, low_stock_threshold, description, created_at, updated_at, inventory_balances(quantity, version), stock_movements(count)"
    )
    .eq("warehouse_id", active.id)
    .order("updated_at", { ascending: false });

  if (statusEq) listQuery.eq("status", statusEq);
  if (q) {
    // Pencarian server-side (PostgREST ilike) — bukan filter frontend.
    const escaped = q.replace(/[%,()]/g, " ");
    listQuery.or(
      `name.ilike.%${escaped}%,sku.ilike.%${escaped}%,category.ilike.%${escaped}%`
    );
  }

  const { data, error } = await listQuery.range(
    (pageNum - 1) * PER_PAGE,
    pageNum * PER_PAGE - 1
  );

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Products"
          description={`${active.name} · inventory.`}
        />
        <ErrorState
          icon={Package}
          title="Unable to load inventory."
          description="Something went wrong while retrieving your inventory. Please try again."
        />
      </div>
    );
  }

  // Total (filter sama dengan list) untuk pagination.
  const countQuery = supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("warehouse_id", active.id);
  if (statusEq) countQuery.eq("status", statusEq);
  if (q) {
    const escaped = q.replace(/[%,()]/g, " ");
    countQuery.or(
      `name.ilike.%${escaped}%,sku.ilike.%${escaped}%,category.ilike.%${escaped}%`
    );
  }
  const { count: totalCount, error: countError } = await countQuery;
  // Audit v0.3.0 §2.4: jangan swallow error count — fallback ke 0
  // menyembunyikan masalah RLS/transien dari operator. Pagination di-hide
  // saat count gagal; banner explisit disisipkan di ProductsPage client.
  if (countError) {
    logger.warn(
      { err: countError.message, warehouseId: active.id },
      "products count query failed"
    );
  }
  const safeTotal = countError ? null : (totalCount ?? 0);

  const products: ProductRow[] = (data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    status: row.status,
    lowStockThreshold: String(row.low_stock_threshold),
    description: row.description,
    createdAt: row.updated_at,
    updatedAt: row.updated_at,
    quantity:
      row.inventory_balances?.[0]?.quantity != null
        ? String(row.inventory_balances[0].quantity)
        : null,
    balanceVersion: row.inventory_balances?.[0]?.version ?? null,
    movementCount: row.stock_movements?.[0]?.count ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description={`${active.name} · inventory.`}
      />
      <ProductsPage
        statusFilter={statusFilter}
        warehouseId={active.id}
        warehouses={warehouses}
        role={active.role}
        products={products}
        query={q}
        page={pageNum}
        perPage={PER_PAGE}
        total={safeTotal ?? 0}
        paginationDisabled={safeTotal === null}
      />
    </div>
  );
}
