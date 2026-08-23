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
