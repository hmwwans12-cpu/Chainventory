import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hex } from "viem";

import { logger } from "@/lib/logger";
import { finalizeIfMined } from "@/lib/warehouses/deployment-finalize";
import { rebroadcastPreparedWarehouseRelay } from "@/lib/warehouses/chain";
import { createServiceClient } from "@/lib/supabase/service";

type DeploymentCandidate = {
  id: string;
  status: string;
  tx_hash: string | null;
  warehouse_id: string | null;
  factory_address: string | null;
  chain_id: number | string | null;
  relay_payload: string | null;
  relay_attempts: number;
  owner_user_id: string | null;
};

async function recordRelayAttempt(
  service: SupabaseClient,
  deploymentId: string,
  attempts: number,
  error: unknown
): Promise<void> {
  const { error: updateError } = await service
    .from("warehouse_deployments")
    .update({
      relay_attempts: attempts + 1,
      relay_last_error:
        error == null
          ? null
          : error instanceof Error
            ? error.message
            : String(error),
      relay_next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .eq("id", deploymentId);
  if (updateError) {
    logger.warn(
      { deploymentId, err: updateError.message },
      "deployment relay attempt state could not be persisted"
    );
  }
}

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
  const createQuery = () =>
    service
      .from("warehouse_deployments")
      .select(
        "id, status, tx_hash, warehouse_id, factory_address, chain_id, relay_payload, relay_attempts"
      )
      .in("status", ["pending", "submitted"]);
  const [withHash, withoutHash] = await Promise.all([
    createQuery()
      .not("tx_hash", "is", null)
      .order("created_at", { ascending: true })
      .limit(10),
    createQuery()
      .is("tx_hash", null)
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  const queryError = withHash.error ?? withoutHash.error;
  if (queryError) {
    return {
      ok: false,
      processed: 0,
      finalized: 0,
      unresolved: 0,
      unknown: 0,
      error: queryError.message,
    };
  }

  const candidates = (withHash.data ?? []) as unknown as Omit<
    DeploymentCandidate,
    "owner_user_id"
  >[];
  const noHashCandidates = (withoutHash.data ?? []) as unknown as Omit<
    DeploymentCandidate,
    "owner_user_id"
  >[];
  let finalized = 0;
  let unresolved = 0;
  let unknown = noHashCandidates.length;
  const errors: string[] = [];
  for (const candidate of noHashCandidates) {
    logger.error(
      { deploymentId: candidate.id },
      "deployment relay outcome has no persisted transaction hash"
    );
  }
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
      if (
        candidate.relay_payload &&
        candidate.factory_address &&
        candidate.chain_id
      ) {
        try {
          await rebroadcastPreparedWarehouseRelay({
            txHash: candidate.tx_hash as Hex,
            rawTransaction: candidate.relay_payload as Hex,
            factoryAddress: candidate.factory_address as Hex,
            chainId: Number(candidate.chain_id),
          });
          await recordRelayAttempt(
            service,
            candidate.id,
            candidate.relay_attempts ?? 0,
            null
          );
        } catch (err) {
          await recordRelayAttempt(
            service,
            candidate.id,
            candidate.relay_attempts ?? 0,
            err
          );
          logger.warn(
            { deploymentId: candidate.id, err },
            "deployment relay rebroadcast failed"
          );
        }
      }
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
    processed: candidates.length + noHashCandidates.length,
    finalized,
    unresolved,
    unknown,
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  };
}
