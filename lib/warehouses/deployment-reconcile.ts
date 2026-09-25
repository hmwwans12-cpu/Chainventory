import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { finalizeIfMined } from "@/lib/warehouses/deployment-finalize";
import { createServiceClient } from "@/lib/supabase/service";

type DeploymentCandidate = {
  id: string;
  status: string;
  tx_hash: string | null;
  warehouse_id: string | null;
  owner_user_id: string | null;
};

export type DeploymentReconcileResult = {
  ok: boolean;
  processed: number;
  finalized: number;
  unresolved: number;
  unknown: number;
  error?: string;
};

export async function reconcileDeployments(
  service: SupabaseClient = createServiceClient()
): Promise<DeploymentReconcileResult> {
  const { data, error } = await service
    .from("warehouse_deployments")
    .select("id, status, tx_hash, warehouse_id")
    .in("status", ["pending", "submitted"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    return {
      ok: false,
      processed: 0,
      finalized: 0,
      unresolved: 0,
      unknown: 0,
      error: error.message,
    };
  }

  const candidates = (data ?? []) as unknown as Omit<
    DeploymentCandidate,
    "owner_user_id"
  >[];
  let finalized = 0;
  let unresolved = 0;
  let unknown = 0;
  const errors: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.warehouse_id) {
      unknown += 1;
      continue;
    }
    if (!candidate.tx_hash) {
      unknown += 1;
      logger.error(
        { deploymentId: candidate.id },
        "deployment relay outcome has no persisted transaction hash"
      );
      continue;
    }
    const { data: warehouse } = await service
      .from("warehouses")
      .select("owner_user_id")
      .eq("id", candidate.warehouse_id)
      .maybeSingle();
    const ownerUserId = (warehouse as { owner_user_id?: string | null } | null)
      ?.owner_user_id;
    if (!ownerUserId) continue;
    try {
      await finalizeIfMined(undefined, service, candidate, ownerUserId, 5_000);
      const { data: settled } = await service
        .from("warehouse_deployments")
        .select("status")
        .eq("id", candidate.id)
        .maybeSingle();
      if (settled?.status === "confirmed" || settled?.status === "failed") {
        finalized += 1;
      } else {
        unresolved += 1;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      logger.error(
        { deploymentId: candidate.id, err },
        "deployment reconciliation failed"
      );
    }
  }

  if (unknown > 0) {
    errors.push(
      `${unknown} deployment(s) require manual relay-outcome recovery`
    );
  }

  return {
    ok: errors.length === 0,
    processed: candidates.length,
    finalized,
    unresolved,
    unknown,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  };
}
