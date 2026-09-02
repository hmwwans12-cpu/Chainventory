import { createClient } from "@/lib/supabase/server";
import {
  approveJoinSchema,
  cancelJoinSchema,
  changeRoleSchema,
  leaveWarehouseSchema,
  rejectJoinSchema,
  removeMemberSchema,
  requestJoinSchema,
  transferOwnershipSchema,
} from "@/lib/validators/membership";
import {
  fromPostgrestError,
  invalid,
  ok,
  readJson,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";

/**
 * RBAC server flow (P1 Step 3b). Semua mutasi membership/join_request lewat
 * sini → RPC security definer (RLS deny by default; otorisasi matrix
 * `canAssignRole` ditegakkan di dalam fungsi DB).
 *
 * POST /api/warehouses/membership?action=request|approve|reject|cancel|leave|remove|change_role|transfer
 */

type Action =
  | "request"
  | "approve"
  | "reject"
  | "cancel"
  | "leave"
  | "remove"
  | "change_role"
  | "transfer";

const ACTION_VALUES: Action[] = [
  "request",
  "approve",
  "reject",
  "cancel",
  "leave",
  "remove",
  "change_role",
  "transfer",
];

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") as Action | null;

  if (!action || !ACTION_VALUES.includes(action)) {
    return invalid("Unknown action.");
  }

  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  // Join/Member Management + ownership transfer: mutation sensitif
  // fail-closed (TECHSTACK §6.1).
  const rateLimited = await requireRateLimit(
    "membership",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  const fn: Record<Action, string> = {
    request: "request_join",
    approve: "approve_join",
    reject: "reject_join",
    cancel: "cancel_join",
    leave: "leave_warehouse",
    remove: "remove_member",
    change_role: "update_member_role",
    transfer: "transfer_ownership",
  };

  const rpcArgs: Record<Action, unknown> = {
    request: { p_warehouse_code: undefined },
    approve: { p_request_id: undefined, p_role: undefined },
    reject: { p_request_id: undefined, p_reason: undefined },
    cancel: { p_request_id: undefined },
    leave: { p_warehouse_id: undefined },
    remove: { p_warehouse_id: undefined, p_user_id: undefined },
    change_role: {
      p_warehouse_id: undefined,
      p_user_id: undefined,
      p_role: undefined,
    },
    transfer: { p_warehouse_id: undefined, p_new_owner_id: undefined },
  };

  // Validate per action.
  switch (action) {
    case "request": {
      const parsed = requestJoinSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.request = { p_warehouse_code: parsed.data.warehouseCode };
      break;
    }
    case "approve": {
      const parsed = approveJoinSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.approve = {
        p_request_id: parsed.data.requestId,
        p_role: parsed.data.role,
      };
      break;
    }
    case "reject": {
      const parsed = rejectJoinSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.reject = {
        p_request_id: parsed.data.requestId,
        p_reason: parsed.data.reason || null,
      };
      break;
    }
    case "cancel": {
      const parsed = cancelJoinSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.cancel = { p_request_id: parsed.data.requestId };
      break;
    }
    case "leave": {
      const parsed = leaveWarehouseSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.leave = { p_warehouse_id: parsed.data.warehouseId };
      break;
    }
    case "remove": {
      const parsed = removeMemberSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.remove = {
        p_warehouse_id: parsed.data.warehouseId,
        p_user_id: parsed.data.userId,
      };
      break;
    }
    case "change_role": {
      const parsed = changeRoleSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.change_role = {
        p_warehouse_id: parsed.data.warehouseId,
        p_user_id: parsed.data.userId,
        p_role: parsed.data.role,
      };
      break;
    }
    case "transfer": {
      const parsed = transferOwnershipSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      rpcArgs.transfer = {
        p_warehouse_id: parsed.data.warehouseId,
        p_new_owner_id: parsed.data.newOwnerId,
      };
      break;
    }
  }

  const { data, error } = await supabase.rpc(
    fn[action],
    rpcArgs[action] as Record<string, unknown>
  );

  if (error) return fromPostgrestError(error.message);

  // Audit v0.3.3 §2.20: untuk `request`, tambahkan warehouse_name ke
  // response agar client UI bisa menampilkan "You requested to join
  // Acme Warehouse" alih-alih hanya kode yang abstrak.
  if (action === "request" && data) {
    const row = Array.isArray(data) ? data[0] : data;
    const warehouseId = (row as { warehouse_id?: string })?.warehouse_id;
    if (warehouseId) {
      const { data: ws } = await supabase
        .from("warehouse_summaries")
        .select("name")
        .eq("id", warehouseId)
        .maybeSingle();
      if (ws?.name) {
        (row as { warehouse_name?: string }).warehouse_name = ws.name;
      }
    }
  }

  return ok(data);
}
