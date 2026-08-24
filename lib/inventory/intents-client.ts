import {
  sendJson,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";

/**
 * Client untuk Stock Intents v2 (`/api/warehouses/inventory/intents`).
 *
 * Flow user-paid proof (PRD §32b):
 *   prepare  -> server membangun calldata recordProof untuk intent ini
 *   (wallet) -> USER menandatangani & membayar gas via Privy provider
 *   submit   -> simpan txHash, status intent = submitted
 *   finalize -> BFF verifikasi tx (contract/actor/proofId) lalu commit stok
 *
 * Finalize bisa menjawab HTTP 202 ("masih confirming") — caller wajib poll.
 */

export const INTENTS_ROUTE = "/api/warehouses/inventory/intents";

export type IntentPrepareInput = {
  warehouseId: string;
  productId: string;
  movementType: "stock_in" | "stock_out";
  quantity: string;
  expectedBalanceVersion?: string | null;
  reason?: string;
  reference?: string;
  idempotencyKey?: string;
  /** Wallet yang menandatangani — wajib untuk flow v2. */
  actorWallet: string;
};

export type PreparedIntent = {
  intentId: string;
  to: string;
  data: string;
  chainId: number;
};

export function prepareStockIntent(
  values: IntentPrepareInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<PreparedIntent>> {
  return sendJson(
    `${INTENTS_ROUTE}?action=prepare`,
    {
      body: {
        warehouseId: values.warehouseId,
        productId: values.productId,
        movementType: values.movementType,
        quantity: values.quantity,
        expectedBalanceVersion: values.expectedBalanceVersion ?? null,
        reason: values.reason ?? "",
        reference: values.reference ?? "",
        idempotencyKey: values.idempotencyKey ?? undefined,
        actorWallet: values.actorWallet,
      },
    },
    fetcher
  ).then(({ status, json }) => parseSuccess<PreparedIntent>(status, json));
}

export function submitStockIntent(
  intentId: string,
  txHash: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<{ status: string }>> {
  return sendJson(
    `${INTENTS_ROUTE}?action=submit`,
    { body: { intentId, txHash } },
    fetcher
  ).then(({ status, json }) => parseSuccess<{ status: string }>(status, json));
}

export type FinalizedIntent = {
  movementId: string;
  balanceVersion: number;
  status: string;
};

/** 200 = committed; 202 = masih confirming (caller harus poll ulang). */
export function finalizeStockIntent(
  intentId: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<FinalizedIntent>> {
  return sendJson(
    `${INTENTS_ROUTE}?action=finalize`,
    { body: { intentId } },
    fetcher
  ).then(({ status, json }) => parseSuccess<FinalizedIntent>(status, json));
}
