import { redirect } from "next/navigation";
import { Package } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductsPage } from "@/components/inventory/products-page";
import type { ProductRow } from "@/lib/inventory/types";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function ProductsPageRoute({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
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

  const warehouses = await getMyWarehouses(supabase, user.id);
  const active = pickActiveWarehouse(warehouses, warehouseParam);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Products"
          description="Manage your warehouse inventory."
        />
        <EmptyState
          icon={Package}
          title="No warehouse yet"
          description="Create a warehouse to start managing inventory, or join one with a warehouse code."
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

  const query = supabase
    .from("products")
    .select(
      "id, sku, name, category, unit, status, low_stock_threshold, description, created_at, updated_at, inventory_balances(quantity, version), stock_movements(count)"
    )
    .eq("warehouse_id", active.id)
    .order("updated_at", { ascending: false });

  if (q) {
    // Pencarian server-side (PostgREST ilike) — bukan filter frontend.
    const escaped = q.replace(/[%,()]/g, " ");
    query.or(
      `name.ilike.%${escaped}%,sku.ilike.%${escaped}%,category.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;

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

  const products: ProductRow[] = (data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    status: row.status,
    lowStockThreshold: String(row.low_stock_threshold),
    description: row.description,
    createdAt: row.created_at,
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
        warehouseId={active.id}
        warehouses={warehouses}
        role={active.role}
        products={products}
        query={q}
      />
    </div>
  );
}
