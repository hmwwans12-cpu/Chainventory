import { redirect } from "next/navigation";
import { Link2, RefreshCcw } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { BlockchainPage } from "@/components/blockchain/blockchain-page";
import type { DeploymentSummary, ProofRow } from "@/lib/blockchain/types";

export const metadata = {
  robots: { index: false, follow: false },
};

const PROOF_LIMIT = 50;

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
          title="Blockchain"
          description="Verification proofs, transaction hashes, and Base Sepolia status."
        />
        <EmptyState
          icon={Link2}
          title="No warehouse yet"
          description="Create a warehouse to see its on-chain proof status, or join one with a warehouse code."
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
          title="Blockchain"
          description={`${active.name} · on-chain status.`}
        />
        <div className="border-border bg-card/50 flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
            <Link2 aria-hidden="true" className="size-6" />
          </span>
          <h3 className="font-display text-foreground mt-2 text-base font-semibold">
            Unable to load blockchain status.
          </h3>
          <p className="text-muted-foreground max-w-sm text-sm">
            Something went wrong while retrieving proof data. Please try again.
          </p>
          <div className="mt-4">
            <Button render={<a href={`/blockchain`} />}>
              <RefreshCcw aria-hidden="true" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Blockchain"
        description={`${active.name} · Base Sepolia.`}
      />
      <BlockchainPage
        warehouseId={active.id}
        warehouses={warehouses}
        contractAddress={active.contractAddress}
        deployment={deploymentResult.data as DeploymentSummary | null}
        proofs={(proofsResult.data as ProofRow[] | null) ?? []}
        totalProofs={countResult.count ?? 0}
      />
    </div>
  );
}
