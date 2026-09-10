import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { RetryErrorState } from "@/components/shared/retry-error-state";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { Badge } from "@/components/ui/badge";
import { BlockchainPage } from "@/components/blockchain/blockchain-page";
import type { DeploymentSummary, ProofRow } from "@/lib/blockchain/types";
import { PROOF_LIMIT } from "@/lib/constants";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function BlockchainPageRoute({
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
          title="Audit Explorer"
          description="Verification proofs, transaction hashes, and Base Sepolia status."
        />
        <NoWarehouse description="Create a warehouse to see its on-chain proof status, or join one with a warehouse code." />
      </div>
    );
  }

  const [deploymentResult, countResult, proofsResult] = await Promise.all([
    supabase
      .from("warehouse_deployment_summaries")
      .select(
        "id, warehouse_id, factory_address, chain_id, status, tx_hash, created_at, updated_at"
      )
      .eq("warehouse_id", active.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("proofs")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", active.id),
    supabase
      .from("proofs")
      .select(
        "id, movement_id, payload_hash, status, tx_hash, error, attempt_count, confirmation_count, created_at"
      )
      .eq("warehouse_id", active.id)
      .order("created_at", { ascending: false })
      .limit(PROOF_LIMIT),
  ]);

  if (countResult.error || proofsResult.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Audit Explorer"
          description={`${active.name} · on-chain status.`}
        />
        <RetryErrorState
          icon={Link2}
          title="Unable to load audit trail."
          description="Something went wrong while retrieving proof data. Please try again."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit Explorer"
        description={`${active.name} · blockchain auditability and transaction proof on Base Sepolia.`}
        actions={
          <Badge variant="neutral" className="gap-1.5 px-3 py-1.5 font-mono">
            <span
              aria-hidden="true"
              className="bg-primary size-1.5 animate-pulse rounded-full"
            />
            Base Sepolia · Chain ID 84532
          </Badge>
        }
      />
      <BlockchainPage
        warehouseId={active.id}
        warehouses={warehouses}
        contractAddress={active.contractAddress}
        deployment={deploymentResult.data as DeploymentSummary | null}
        deploymentError={Boolean(deploymentResult.error)}
        proofs={(proofsResult.data as ProofRow[] | null) ?? []}
        totalProofs={countResult.count ?? 0}
      />
    </div>
  );
}
