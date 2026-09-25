import { createPublicClient, type Hex } from "viem";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

export type FaucetReconcileResult = {
  ok: boolean;
  processed: number;
  confirmed: number;
  failed: number;
  pending: number;
  unknown: number;
  error?: string;
};

export async function reconcileFaucetClaims(): Promise<FaucetReconcileResult> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("faucet_claims")
    .select("id, tx_hash")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return {
      ok: false,
      processed: 0,
      confirmed: 0,
      failed: 0,
      pending: 0,
      unknown: 0,
      error: error.message,
    };
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: createChainTransport(),
  });
  const claims = data ?? [];
  let confirmed = 0;
  let failed = 0;
  let pending = 0;
  let unknown = 0;
  const errors: string[] = [];

  for (const claim of claims) {
    if (!claim.tx_hash) {
      pending += 1;
      unknown += 1;
      errors.push(`claim ${claim.id} has no persisted transaction hash`);
      logger.error(
        { claimId: claim.id },
        "faucet claim has no persisted transaction hash"
      );
      continue;
    }
    try {
      const receipt = await client.getTransactionReceipt({
        hash: claim.tx_hash as Hex,
      });
      if (receipt.status === "success") {
        const { error: updateError } = await service.rpc(
          "confirm_faucet_claim",
          {
            p_claim_id: claim.id,
            p_tx_hash: claim.tx_hash,
            p_status: "confirmed",
          }
        );
        if (updateError) throw new Error(updateError.message);
        confirmed += 1;
      } else if (receipt.status === "reverted") {
        const { error: updateError } = await service.rpc(
          "confirm_faucet_claim",
          {
            p_claim_id: claim.id,
            p_tx_hash: claim.tx_hash,
            p_status: "failed",
          }
        );
        if (updateError) throw new Error(updateError.message);
        failed += 1;
      } else {
        pending += 1;
      }
    } catch (err) {
      pending += 1;
      errors.push(err instanceof Error ? err.message : String(err));
      logger.error(
        { claimId: claim.id, txHash: claim.tx_hash, err },
        "faucet claim reconciliation failed"
      );
    }
  }

  return {
    ok: errors.length === 0,
    processed: claims.length,
    confirmed,
    failed,
    pending,
    unknown,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}
