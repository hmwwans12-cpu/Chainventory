import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { TransactionsPage } from "@/components/transactions/transactions-page";
import type { MovementListItem, MovementStatus } from "@/lib/inventory/types";

export const metadata = {
  robots: { index: false, follow: false },
};

const PER_PAGE = 20;

const TYPE_VALUES = [
  "stock_in",
  "stock_out",
  "adjustment",
  "reversal",
] as const;

const PROOF_KEYS = ["confirmed", "pending", "failed"] as const;

type LedgerRow = {
  id: string;
  movement_type: "stock_in" | "stock_out" | "adjustment" | "reversal";
  quantity: string;
  status: MovementStatus;
  reason: string | null;
  reference: string | null;
  actor_wallet: string | null;
  expected_balance_version: number | null;
  created_at: string;
  product: { id: string; name: string; sku: string; unit: string } | null;
  proof: {
    id: string;
    status: string;
    tx_hash: string | null;
    error: string | null;
  } | null;
};

type LedgerResponse = { total: number; rows: LedgerRow[] };

export default async function TransactionsPageRoute({
  searchParams,
}: {
  searchParams: Promise<{
    warehouse?: string | string[];
    page?: string | string[];
    type?: string | string[];
    proof?: string | string[];
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
  const rawPage = typeof params.page === "string" ? params.page : undefined;
  const rawType = typeof params.type === "string" ? params.type : undefined;
  const rawProof = typeof params.proof === "string" ? params.proof : undefined;

  const warehouses = await getMyWarehouses(supabase, user.id);
  const active = pickActiveWarehouse(warehouses, warehouseParam);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Transactions"
          description="Stock operations and their blockchain proof status."
        />
        <EmptyState
          icon={ArrowLeftRight}
          title="No warehouse yet"
          description="Create a warehouse to start recording transactions, or join one with a warehouse code."
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

  const pageNum = Math.max(1, Number(rawPage) || 1);
  const type = TYPE_VALUES.includes(rawType as (typeof TYPE_VALUES)[number])
    ? (rawType as (typeof TYPE_VALUES)[number])
    : undefined;
  const proofKey = PROOF_KEYS.includes(rawProof as (typeof PROOF_KEYS)[number])
    ? (rawProof as (typeof PROOF_KEYS)[number])
    : undefined;

  const { data, error } = await supabase.rpc("list_transactions", {
    p_warehouse_id: active.id,
    p_movement_type: type ?? null,
    p_proof_bucket: proofKey ?? null,
    p_page: pageNum,
    p_per_page: PER_PAGE,
  });

  const ledger = data as LedgerResponse | null;

  if (error || !ledger) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Transactions"
          description={`${active.name} · ledger.`}
        />
        <ErrorState
          icon={ArrowLeftRight}
          title="Unable to load transactions."
          description="Something went wrong while retrieving the ledger. Please try again."
        />
      </div>
    );
  }

  const totalCount = ledger.total;
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));
  const page = Math.min(Math.max(1, pageNum), totalPages);

  const items: MovementListItem[] = ledger.rows.map((row) => ({
    id: row.id,
    movementType: row.movement_type,
    quantity: row.quantity,
    status: row.status,
    reason: row.reason,
    reference: row.reference,
    actorWallet: row.actor_wallet,
    expectedBalanceVersion: row.expected_balance_version,
    created_at: row.created_at,
    productName: row.product?.name ?? "Unknown product",
    productSku: row.product?.sku ?? "",
    unit: row.product?.unit ?? "",
    proofStatus: row.proof?.status ?? null,
    proofTxHash: row.proof?.tx_hash ?? null,
    proofError: row.proof?.error ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description={`${active.name} · on-chain ledger.`}
      />
      <TransactionsPage
        warehouseId={active.id}
        warehouses={warehouses}
        items={items}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        type={type}
        proof={proofKey}
      />
    </div>
  );
}
