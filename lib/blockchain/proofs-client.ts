import {
  sendJson,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";

/**
 * Blockchain client (BFF `/api/warehouses/blockchain/proofs`).
 *
 * NBE-06: retry proof adalah kapabilitas DEVELOPER ALLOWLIST (bukan
 * member-only) — route menolak non-allowlist dengan 403 yang jelas.
 * Jangan panggil dari UI member umum; Developer Console memakai
 * `/api/console/proofs/[id]/retry` (jalur manual_review yang sama).
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
