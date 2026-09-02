import { z } from "zod";

import { ROLES } from "@/lib/auth/permissions";

/**
 * Validators untuk RBAC server flow (join/approve/reject/cancel/leave/remove).
 * Dipakai di Route Handler `/api/warehouses/...` (P1 Step 3b).
 */

export const requestJoinSchema = z.object({
  warehouseCode: z
    .string()
    .trim()
    .min(1, "Enter a warehouse code.")
    .max(64, "Warehouse code is too long."),
});

/** Role yang boleh diundang via email (tidak boleh OWNER). */
const INVITABLE_ROLES = ROLES.filter((r) => r !== "OWNER") as Exclude<
  (typeof ROLES)[number],
  "OWNER"
>[];

export const createInvitationSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  email: z.string().trim().email("Invalid email address.").max(254),
  role: z.enum(INVITABLE_ROLES, { message: "Invalid role." }),
});

export const approveJoinSchema = z.object({
  requestId: z.string().uuid("Invalid request id."),
  role: z.enum(ROLES, { message: "Invalid role." }),
});

export const rejectJoinSchema = z.object({
  requestId: z.string().uuid("Invalid request id."),
  reason: z
    .string()
    .trim()
    .max(500, "Reason is too long.")
    .optional()
    .default(""),
});

export const cancelJoinSchema = z.object({
  requestId: z.string().uuid("Invalid request id."),
});

export const leaveWarehouseSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
});

export const removeMemberSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  userId: z.string().uuid("Invalid user id."),
});

export const changeRoleSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  userId: z.string().uuid("Invalid user id."),
  role: z.enum(ROLES, { message: "Invalid role." }),
});

export const transferOwnershipSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  newOwnerId: z.string().uuid("Invalid user id."),
});

export type RequestJoinValues = z.infer<typeof requestJoinSchema>;
export type ApproveJoinValues = z.infer<typeof approveJoinSchema>;
export type RejectJoinValues = z.infer<typeof rejectJoinSchema>;
export type CancelJoinValues = z.infer<typeof cancelJoinSchema>;
export type LeaveWarehouseValues = z.infer<typeof leaveWarehouseSchema>;
export type RemoveMemberValues = z.infer<typeof removeMemberSchema>;
export type ChangeRoleValues = z.infer<typeof changeRoleSchema>;
export type TransferOwnershipValues = z.infer<typeof transferOwnershipSchema>;
