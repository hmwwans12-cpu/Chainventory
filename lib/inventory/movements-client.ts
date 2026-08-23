import {
  sendJson,
  newIdempotencyKey,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";

/**
 * Stock movement client (BFF `/api/warehouses/inventory/movements`).
 *
 * `applyMovement` memanggil RPC `apply_stock_movement` lewat route handler.
 * Error STALE_STOCK / INSUFFICIENT_STOCK dikembalikan HTTP 409 dengan
 * `errorCode` — UI HARUS membedakan keduanya (DESIGN §64):
 *  - STALE_STOCK → "Stock updated by another user. Refreshing inventory..." + auto refresh
 *  - INSUFFICIENT_STOCK → "Not enough stock available" + saldo saat ini (penolakan permanen)
 *
 * Semua nilai numerik string decimal (tanpa float), sesuai validator.
 */

export const MOVEMENTS_ROUTE = "/api/warehouses/inventory/movements";

export type MovementType = "stock_in" | "stock_out" | "adjustment" | "reversal";

export type ApplyMovementInput = {
  warehouseId: string;
  productId: string;
  movementType: MovementType;
  quantity: string;
  expectedBalanceVersion?: string | null;
  reason?: string;
  reference?: string;
  reversalOf?: string | null;
  idempotencyKey?: string;
  actorWallet?: string | null;
};

export type ApplyMovementResult = {
  movementId: string;
  balanceVersion: number;
  proofPending: boolean;
};

export async function applyMovement(
  values: ApplyMovementInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<ApplyMovementResult>> {
  const { status, json } = await sendJson(
    `${MOVEMENTS_ROUTE}?action=apply`,
    {
      body: {
        warehouseId: values.warehouseId,
        productId: values.productId,
        movementType: values.movementType,
        quantity: values.quantity,
        expectedBalanceVersion: values.expectedBalanceVersion ?? null,
        reason: values.reason ?? "",
        reference: values.reference ?? "",
        reversalOf: values.reversalOf ?? null,
        idempotencyKey: values.idempotencyKey ?? newIdempotencyKey(),
        actorWallet: values.actorWallet ?? null,
      },
    },
    fetcher
  );
  return parseSuccess<ApplyMovementResult>(status, json);
}

export async function approveAdjustment(
  movementId: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MOVEMENTS_ROUTE}?action=approve`,
    { body: { movementId } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

export async function rejectAdjustment(
  movementId: string,
  reason: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MOVEMENTS_ROUTE}?action=reject`,
    { body: { movementId, reason } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}
