import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { RetryErrorState } from "@/components/shared/retry-error-state";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { Badge } from "@/components/ui/badge";
import { TransactionsPage } from "@/components/transactions/transactions-page";
import type { MovementListItem, MovementStatus } from "@/lib/inventory/types";
import { BASE_SEPOLIA_CHAIN_ID, TRANSACTIONS_PER_PAGE } from "@/lib/constants";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

const PER_PAGE = TRANSACTIONS_PER_PAGE;

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
    q?: string | string[];
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
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("tx.title")}
          description={t("tx.description")}
        />
        <NoWarehouse
          title={t("dashboard.empty_title")}
          description={t("tx.no_warehouse_desc")}
          createLabel={t("dashboard.create_warehouse")}
          joinLabel={t("dashboard.join_warehouse")}
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
  // Temuan audit #25: pencarian server-side (?q=) by reference/reason/
  // wallet aktor/nama/SKU produk. Cap 100 char agar URL/RPC tetap ringan.
  const rawQ =
    typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const { data, error } = await supabase.rpc("list_transactions", {
    p_warehouse_id: active.id,
    p_movement_type: type ?? null,
    p_proof_bucket: proofKey ?? null,
    p_page: pageNum,
    p_per_page: PER_PAGE,
    p_search: rawQ || null,
  });

  const ledger = data as LedgerResponse | null;

  if (error || !ledger) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("tx.title")}
          description={t("tx.header_ledger", { name: active.name })}
        />
        <RetryErrorState
          icon={ArrowLeftRight}
          title={t("tx.error_title")}
          description={t("tx.error_desc")}
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
    productName: row.product?.name ?? t("tx.unknown_product"),
    productSku: row.product?.sku ?? "",
    unit: row.product?.unit ?? "",
    proofStatus: row.proof?.status ?? null,
    proofTxHash: row.proof?.tx_hash ?? null,
    proofError: row.proof?.error ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("tx.title")}
        description={t("tx.header_desc", { name: active.name })}
        pill={
          <Badge variant="success" className="font-mono">
            {t("tx.live_ledger")}
          </Badge>
        }
        actions={
          <Badge variant="neutral" className="gap-1.5 px-3 py-1.5 font-mono">
            <span
              aria-hidden="true"
              className="bg-primary size-1.5 animate-pulse rounded-full"
            />
            {t("tx.chain_badge", { chainId: String(BASE_SEPOLIA_CHAIN_ID) })}
          </Badge>
        }
      />
      <TransactionsPage
        warehouseId={active.id}
        warehouses={warehouses}
        role={active.role}
        items={items}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        type={type}
        proof={proofKey}
        query={rawQ}
      />
    </div>
  );
}
