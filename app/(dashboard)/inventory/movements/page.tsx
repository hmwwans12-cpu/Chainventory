import { redirect } from "next/navigation";
import { ArrowDownToLine } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MovementsPage } from "@/components/inventory/movements-page";
import {
  embedOne,
  type MovementListItem,
  type ProductRow,
} from "@/lib/inventory/types";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

export default async function StockMovementsPageRoute({
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
          title="Stock Movement"
          description="Ledger of all stock in/out movements."
        />
        <EmptyState
          icon={ArrowDownToLine}
          title="No warehouse yet"
          description="Create a warehouse to start recording stock movements, or join one with a warehouse code."
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

  const [movementsResult, productsResult] = await Promise.all([
    supabase
      .from("stock_movements")
      .select(
        "id, movement_type, quantity, status, reason, reference, actor_wallet, expected_balance_version, created_at, products(id, name, sku, unit), proofs(status, tx_hash, error)"
      )
      .eq("warehouse_id", active.id)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from("products")
      .select(
        "id, sku, name, category, unit, status, low_stock_threshold, inventory_balances(quantity, version)"
      )
      .eq("warehouse_id", active.id)
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);

  if (movementsResult.error || productsResult.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Stock Movement"
          description={`${active.name} · ledger.`}
        />
        <ErrorState
          icon={ArrowDownToLine}
          title="Unable to load movements."
          description="Something went wrong while retrieving the ledger. Please try again."
        />
      </div>
    );
  }

  const movements: MovementListItem[] = (movementsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      movementType: row.movement_type,
      quantity: String(row.quantity),
      status: row.status,
      reason: row.reason,
      reference: row.reference,
      actorWallet: row.actor_wallet,
      expectedBalanceVersion: row.expected_balance_version,
      created_at: row.created_at,
      productName: embedOne(row.products)?.name ?? "Unknown product",
      productSku: embedOne(row.products)?.sku ?? "",
      unit: embedOne(row.products)?.unit ?? "",
      proofStatus: row.proofs?.[0]?.status ?? null,
      proofTxHash: row.proofs?.[0]?.tx_hash ?? null,
      proofError: row.proofs?.[0]?.error ?? null,
    })
  );

  const products: ProductRow[] = (productsResult.data ?? []).map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    status: row.status,
    lowStockThreshold: String(row.low_stock_threshold),
    description: null,
    createdAt: "",
    updatedAt: "",
    quantity:
      row.inventory_balances?.[0]?.quantity != null
        ? String(row.inventory_balances[0].quantity)
        : null,
    balanceVersion: row.inventory_balances?.[0]?.version ?? null,
    movementCount: 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock Movement"
        description={`${active.name} · ledger.`}
      />
      <MovementsPage
        warehouseId={active.id}
        warehouses={warehouses}
        role={active.role}
        products={products}
        initialMovements={movements}
      />
    </div>
  );
}
