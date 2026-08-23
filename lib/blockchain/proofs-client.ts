import {
  sendJson,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";

/**
 * Blockchain client (BFF `/api/warehouses/blockchain/proofs`).
 * Retry proof → route handler → RPC `proof_retry` (member-only, DB-enforced).
 */
export const BLOCKCHAIN_PROOFS_ROUTE = "/api/warehouses/blockchain/proofs";

export async function retryProof(
  proofId: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${BLOCKCHAIN_PROOFS_ROUTE}?action=retry`,
    { body: { proofId } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}
