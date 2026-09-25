import {
  sendJson,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";
import type { Role } from "@/lib/auth/permissions";

/**
 * Members client (BFF `/api/warehouses/membership`).
 * Semua mutasi member/role/ownership lewat route handler → RPC security
 * definer (RLS deny by default; otorisasi `can_assign_role` di sisi DB).
 */

export const MEMBERSHIP_ROUTE = "/api/warehouses/membership";

export type OwnershipTransferIntent = {
  intentId: string;
  idempotencyKey: string;
  newOwnerId: string;
  wallet: string;
  contractAddress: string;
  generation: string;
  status: "prepared" | "submitted" | "confirmed" | "failed" | "expired";
  txHash: string | null;
  expiresAt: string;
};

export type OwnershipTransferPreview = OwnershipTransferIntent;

function unwrapTransferData<T>(data: T | { data: T }): T {
  if (data && typeof data === "object" && "data" in data) {
    return (data as { data: T }).data;
  }
  return data as T;
}

export async function changeMemberRole(
  values: { warehouseId: string; userId: string; role: Role },
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=change_role`,
    {
      body: {
        warehouseId: values.warehouseId,
        userId: values.userId,
        role: values.role,
      },
    },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

export async function transferOwnership(
  values: { warehouseId: string; newOwnerId: string },
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=transfer`,
    {
      body: { warehouseId: values.warehouseId, newOwnerId: values.newOwnerId },
    },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

/**
 * Alur on-chain: prepare resolve wallet target dan menyimpan intent durable,
 * confirm sinkron DB pasca verifikasi tx.
 */
export async function previewTransferTarget(
  values: {
    warehouseId: string;
    newOwnerId: string;
    idempotencyKey?: string;
  },
  fetcher: Fetcher = fetch
): Promise<ApiResult<OwnershipTransferPreview>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=transfer_preview`,
    {
      body: {
        warehouseId: values.warehouseId,
        newOwnerId: values.newOwnerId,
        ...(values.idempotencyKey
          ? { idempotencyKey: values.idempotencyKey }
          : {}),
      },
    },
    fetcher
  );
  const result = parseSuccess<OwnershipTransferPreview>(status, json);
  if (!result.ok) return result;
  return {
    ...result,
    data: unwrapTransferData(result.data),
  };
}

export async function resumeOwnershipTransfer(
  values: { warehouseId: string },
  fetcher: Fetcher = fetch
): Promise<ApiResult<{ intent: OwnershipTransferIntent | null }>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=transfer_resume`,
    { body: { warehouseId: values.warehouseId } },
    fetcher
  );
  const result = parseSuccess<{ intent: OwnershipTransferIntent | null }>(
    status,
    json
  );
  if (!result.ok) return result;
  return {
    ...result,
    data: unwrapTransferData(result.data),
  };
}

export async function confirmOwnershipTransfer(
  values: {
    warehouseId: string;
    newOwnerId: string;
    txHash: string;
    intentId?: string;
  },
  fetcher: Fetcher = fetch
): Promise<
  ApiResult<{
    newOwnerWallet: string;
    intentId?: string | null;
    recovered?: boolean;
  }>
> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=transfer_confirm`,
    {
      body: {
        warehouseId: values.warehouseId,
        newOwnerId: values.newOwnerId,
        txHash: values.txHash,
        ...(values.intentId ? { intentId: values.intentId } : {}),
      },
    },
    fetcher
  );
  const result = parseSuccess<{
    newOwnerWallet: string;
    intentId?: string | null;
    recovered?: boolean;
  }>(status, json);
  if (!result.ok) return result;
  return {
    ...result,
    data: unwrapTransferData(result.data),
  };
}

export async function pollOwnershipTransfer(
  values: {
    warehouseId: string;
    newOwnerId: string;
    txHash: string;
    intentId?: string;
  },
  fetcher: Fetcher = fetch
): Promise<
  ApiResult<{
    newOwnerWallet: string;
    intentId?: string | null;
    recovered?: boolean;
  }>
> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await confirmOwnershipTransfer(values, fetcher);
    if (result.ok || result.status !== 202) return result;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return {
    ok: false,
    status: 202,
    error:
      "Ownership transfer is still confirming. Try synchronizing again shortly.",
    errorCode: "CONFIRMING",
  };
}

export async function removeMember(
  values: { warehouseId: string; userId: string },
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=remove`,
    { body: { warehouseId: values.warehouseId, userId: values.userId } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

export async function leaveWarehouse(
  warehouseId: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=leave`,
    { body: { warehouseId } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

/**
 * Approve join request. `role` WAJIB lolos matrix `canAssignRole(actor)`
 * di sisi UI (OWNER → +MANAGER; MANAGER → STAFF/AUDITOR/VIEWER saja) —
 * dan ditegakkan ulang oleh RPC `approve_join` (defense-in-depth).
 */
export async function approveJoin(
  values: { requestId: string; role: Role },
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=approve`,
    { body: { requestId: values.requestId, role: values.role } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

export async function rejectJoin(
  values: { requestId: string; reason?: string },
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    `${MEMBERSHIP_ROUTE}?action=reject`,
    { body: { requestId: values.requestId, reason: values.reason ?? "" } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}
