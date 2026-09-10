import { redirect } from "next/navigation";
import { LayoutGrid, Package, TriangleAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { isLowStock } from "@/lib/inventory/low-stock";
import { RetryErrorState } from "@/components/shared/retry-error-state";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { Badge } from "@/components/ui/badge";
import { ProductsPage } from "@/components/inventory/products-page";
import type { ProductRow } from "@/lib/inventory/types";
import { PRODUCTS_PER_PAGE } from "@/lib/constants";

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
    category?: string | string[];
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
  // Stitch category filter — exact match, dikosongkan bila "all".
  const categoryFilter =
    typeof params.category === "string" && params.category.trim() !== ""
      ? params.category.trim()
      : "";

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
  const PER_PAGE = PRODUCTS_PER_PAGE;

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
  if (categoryFilter) listQuery.eq("category", categoryFilter);
  if (q) {
    // Pencarian server-side (PostgREST ilike) — bukan filter frontend.
    // FE-26: sertakan `_` (wildcard 1-char) dan `\` (escape) — sebelumnya
    // hanya %,() sehingga pola "_" over-match.
    const escaped = q.replace(/[%_\\()]/g, " ");
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
        <RetryErrorState
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
  if (categoryFilter) countQuery.eq("category", categoryFilter);
  if (q) {
    const escaped = q.replace(/[%_\\()]/g, " ");
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
  // Stitch KPI pills: low-stock count (aturan sama dengan dashboard) +
  // daftar kategori distinct untuk filter. Ringan: kolom sempit + limit.
  const [lowStockRes, categoriesRes] = await Promise.all([
    supabase
      .from("products")
      .select("status, low_stock_threshold, inventory_balances(quantity)")
      .eq("warehouse_id", active.id)
      .eq("status", "active")
      .limit(5000),
    supabase
      .from("products")
      .select("category")
      .eq("warehouse_id", active.id)
      .limit(5000),
  ]);
  let lowStockCount = 0;
  for (const row of lowStockRes.data ?? []) {
    const balanceRow = Array.isArray(row.inventory_balances)
      ? row.inventory_balances[0]
      : row.inventory_balances;
    if (
      isLowStock({
        status: "active",
        quantity: balanceRow?.quantity ?? null,
        threshold: row.low_stock_threshold,
      })
    )
      lowStockCount += 1;
  }
  const categories = [
    ...new Set(
      (categoriesRes.data ?? [])
        .map((r) => (r.category ?? "").trim())
        .filter((c) => c !== "")
    ),
  ].sort((a, b) => a.localeCompare(b));
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
        description={`${active.name} · ${active.code} · inventory catalog.`}
        pill={
          <Badge variant="success">
            <span
              aria-hidden="true"
              className="size-1.5 animate-pulse rounded-full bg-current"
            />
            Live Synced
          </Badge>
        }
        actions={
          <>
            <Badge variant="neutral" className="gap-1.5 px-3 py-1.5">
              <Package aria-hidden="true" className="size-3.5" />
              {(safeTotal ?? 0).toLocaleString()} SKUs Total
            </Badge>
            <Badge
              variant={lowStockCount > 0 ? "warning" : "neutral"}
              className="gap-1.5 px-3 py-1.5"
            >
              <TriangleAlert aria-hidden="true" className="size-3.5" />
              {lowStockCount} Low Stock Alerts
            </Badge>
            <Badge variant="neutral" className="gap-1.5 px-3 py-1.5">
              <LayoutGrid aria-hidden="true" className="size-3.5" />
              {categories.length} Categories
            </Badge>
          </>
        }
      />
      <ProductsPage
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        categories={categories}
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
