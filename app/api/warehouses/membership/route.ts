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
  forbidden,
  fromPostgrestError,
  invalid,
  ok,
  readJson,
  requirePermission,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/auth/permissions";

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
  // Audit v0.3.10 H-10: ownership transfer uses a tighter dedicated
  // bucket (3 user / 10 IP per minute) so a burst of join-approval
  // activity cannot exhaust the budget that protects the most
  // sensitive action in this route.
  const rateLimited = await requireRateLimit(
    action === "transfer" ? "ownership-transfer" : "membership",
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

  // Validate per action AND perform Route-Handler RBAC defense-in-depth
  // (audit v0.3.10 H-09). The DB-level security-definer functions remain
  // the primary authorization boundary per AGENT.md §3; these checks
  // catch obvious bugs in the DB layer early with clearer error messages.
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
      // Look up the warehouse on the join_request to do the permission
      // check, since the request body only has requestId.
      const { data: req } = await supabase
        .from("join_requests")
        .select("warehouse_id")
        .eq("id", parsed.data.requestId)
        .maybeSingle();
      if (!req?.warehouse_id) return forbidden("Join request not found.");
      const denied = await requirePermission(
        supabase,
        req.warehouse_id,
        auth.user.id,
        PERMISSIONS.JOIN_REQUEST_APPROVE
      );
      if (denied) return denied;
      rpcArgs.approve = {
        p_request_id: parsed.data.requestId,
        p_role: parsed.data.role,
      };
      break;
    }
    case "reject": {
      const parsed = rejectJoinSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      const { data: req } = await supabase
        .from("join_requests")
        .select("warehouse_id")
        .eq("id", parsed.data.requestId)
        .maybeSingle();
      if (!req?.warehouse_id) return forbidden("Join request not found.");
      const denied = await requirePermission(
        supabase,
        req.warehouse_id,
        auth.user.id,
        PERMISSIONS.JOIN_REQUEST_APPROVE
      );
      if (denied) return denied;
      rpcArgs.reject = {
        p_request_id: parsed.data.requestId,
        p_reason: parsed.data.reason || null,
      };
      break;
    }
    case "cancel": {
      const parsed = cancelJoinSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      // Cancel is the requester's own action; the RPC checks that
      // auth.uid() is the request creator. No additional check needed.
      rpcArgs.cancel = { p_request_id: parsed.data.requestId };
      break;
    }
    case "leave": {
      const parsed = leaveWarehouseSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      // Leave is the actor's own action; the RPC checks that
      // auth.uid() is a current member. No additional check needed.
      rpcArgs.leave = { p_warehouse_id: parsed.data.warehouseId };
      break;
    }
    case "remove": {
      const parsed = removeMemberSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      const denied = await requirePermission(
        supabase,
        parsed.data.warehouseId,
        auth.user.id,
        PERMISSIONS.JOIN_REQUEST_APPROVE
      );
      if (denied) return denied;
      rpcArgs.remove = {
        p_warehouse_id: parsed.data.warehouseId,
        p_user_id: parsed.data.userId,
      };
      break;
    }
    case "change_role": {
      const parsed = changeRoleSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
      const denied = await requirePermission(
        supabase,
        parsed.data.warehouseId,
        auth.user.id,
        PERMISSIONS.JOIN_REQUEST_APPROVE
      );
      if (denied) return denied;
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
      // Only Owner can transfer ownership. JOIN_REQUEST_APPROVE is
      // granted to Owner/Manager; we need a stricter check here.
      const { data: me } = await supabase
        .from("memberships")
        .select("role")
        .eq("warehouse_id", parsed.data.warehouseId)
        .eq("user_id", auth.user.id)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (me?.role !== "OWNER") {
        return forbidden("Only the owner can transfer ownership.");
      }
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
