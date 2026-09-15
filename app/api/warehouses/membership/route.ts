import { createPublicClient, type Hex } from "viem";

import { createClient } from "@/lib/supabase/server";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { verifyOwnershipTransferTx } from "@/lib/blockchain/ownership-proof";
import {
  approveJoinSchema,
  cancelJoinSchema,
  changeRoleSchema,
  leaveWarehouseSchema,
  rejectJoinSchema,
  removeMemberSchema,
  requestJoinSchema,
  transferConfirmSchema,
  transferOwnershipSchema,
  transferPreviewSchema,
} from "@/lib/validators/membership";
import {
  forbidden,
  fromPostgrestError,
  invalid,
  json,
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
  | "transfer"
  | "transfer_preview"
  | "transfer_confirm";

const ACTION_VALUES: Action[] = [
  "request",
  "approve",
  "reject",
  "cancel",
  "leave",
  "remove",
  "change_role",
  "transfer",
  "transfer_preview",
  "transfer_confirm",
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
    action === "transfer" ||
      action === "transfer_preview" ||
      action === "transfer_confirm"
      ? "ownership-transfer"
      : "membership",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  // Alur on-chain (temuan audit #4): logika kustom, bukan dispatch RPC
  // generik di bawah — return langsung dari sini.
  if (action === "transfer_preview" || action === "transfer_confirm") {
    return handleOnchainTransfer(supabase, auth.user.id, action, raw.body);
  }

  const fn: Record<
    Exclude<Action, "transfer_preview" | "transfer_confirm">,
    string
  > = {
    request: "request_join",
    approve: "approve_join",
    reject: "reject_join",
    cancel: "cancel_join",
    leave: "leave_warehouse",
    remove: "remove_member",
    change_role: "update_member_role",
    transfer: "transfer_ownership",
  };

  const rpcArgs: Record<
    Exclude<Action, "transfer_preview" | "transfer_confirm">,
    unknown
  > = {
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
      // Fix A5: warehouse yang sudah deployed punya owner on-chain
      // (Warehouse.owner + Factory.activeWarehouse). Transfer off-chain
      // murni bikin divergen permanen off-chain ≠ on-chain (ARSITEKTUR
      // §4.4/§5). Blokir di sini; pemilik harus transferOwnership on-chain
      // dari wallet owner lama → processor confirm → sinkron DB atomik.
      // Full async migration flow adalah P1; blokir ini adalah P0 safety.
      const { data: wh } = await supabase
        .from("warehouses")
        .select("contract_address")
        .eq("id", parsed.data.warehouseId)
        .maybeSingle();
      if (wh?.contract_address) {
        return json(
          {
            ok: false,
            error:
              "This warehouse is deployed on-chain. Transfer ownership from your owner wallet on Base Sepolia first, then sync. Off-chain-only transfer is blocked to prevent on-chain divergence.",
            errorCode: "CONFLICT",
          },
          409
        );
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

const OWNER_READ_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function requireTransferParties(
  supabase: DbClient,
  callerId: string,
  warehouseId: string,
  newOwnerId: string
) {
  if (newOwnerId === callerId) return { error: invalid("Already the owner.") };
  const { data: me } = await supabase
    .from("memberships")
    .select("role")
    .eq("warehouse_id", warehouseId)
    .eq("user_id", callerId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (me?.role !== "OWNER") {
    return { error: forbidden("Only the owner can transfer ownership.") };
  }
  const { data: target } = await supabase
    .from("memberships")
    .select("user_id, status")
    .eq("warehouse_id", warehouseId)
    .eq("user_id", newOwnerId)
    .maybeSingle();
  if (!target) return { error: invalid("Target is not a member.") };
  if (target.status !== "ACTIVE") {
    return { error: invalid("Target membership is not active.") };
  }
  // Wallet primary verified milik target — bukti ia mengendalikan address
  // yang akan dicatat on-chain (anti lockout, konsisten P1-03).
  const { data: wallet } = await supabase
    .from("wallets")
    .select("address")
    .eq("user_id", newOwnerId)
    .eq("is_primary", true)
    .eq("verification_state", "verified")
    .maybeSingle();
  if (!wallet?.address) {
    return {
      error: invalid("Target member has no verified primary wallet yet."),
    };
  }
  return { wallet: (wallet.address as string).toLowerCase() };
}

/**
 * Alur on-chain transfer ownership (temuan audit #4).
 *
 * preview: resolve + kembalikan wallet target (tanpa efek samping).
 * confirm: verifikasi tx on-chain (to/fungsi/from/argumen, ikut pola
 * verifyIntentProofTx) lalu panggil RPC confirm_ownership_transfer yang
 * melakukan sinkron DB atomik. Tanpa verifikasi ini, siapa pun bisa
 * mengklaim tx orang lain untuk mencuri ownership di DB.
 */
async function handleOnchainTransfer(
  supabase: DbClient,
  callerId: string,
  action: "transfer_preview" | "transfer_confirm",
  body: unknown
) {
  if (action === "transfer_preview") {
    const parsed = transferPreviewSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    const { warehouseId, newOwnerId } = parsed.data;
    const parties = await requireTransferParties(
      supabase,
      callerId,
      warehouseId,
      newOwnerId
    );
    if ("error" in parties) return parties.error;
    return ok({ data: { wallet: parties.wallet } });
  }

  const parsed = transferConfirmSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { warehouseId, newOwnerId, txHash } = parsed.data;

  const parties = await requireTransferParties(
    supabase,
    callerId,
    warehouseId,
    newOwnerId
  );
  if ("error" in parties) return parties.error;

  const { data: warehouse } = await supabase
    .from("warehouse_summaries")
    .select("contract_address")
    .eq("id", warehouseId)
    .maybeSingle();
  const contractAddress = warehouse?.contract_address as string | undefined;
  if (!contractAddress) {
    return invalid(
      "This warehouse is not deployed on-chain. Use the off-chain transfer instead."
    );
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: createChainTransport(),
  });
  let tx: { to: string | null; from: string; input: Hex };
  let receiptStatus: string | undefined;
  let onChainOwner: string;
  try {
    const [fetched, receipt, owner] = await Promise.all([
      client.getTransaction({ hash: txHash as Hex }),
      client.getTransactionReceipt({ hash: txHash as Hex }),
      client.readContract({
        address: contractAddress as Hex,
        abi: OWNER_READ_ABI,
        functionName: "owner",
      }),
    ]);
    tx = { to: fetched.to, from: fetched.from, input: fetched.input };
    receiptStatus = receipt.status;
    onChainOwner = owner as string;
  } catch {
    return json(
      {
        ok: false,
        error: "Transaction not found or still confirming. Try again shortly.",
        errorCode: "RPC_FAILED",
      },
      202
    );
  }

  const verdict = verifyOwnershipTransferTx(
    { ...tx, status: receiptStatus },
    {
      contractAddress,
      currentOwnerWallet: onChainOwner,
      newOwnerWallet: parties.wallet,
    }
  );
  if (!verdict.ok) {
    return json(
      {
        ok: false,
        error: `Wallet transaction is not a valid ownership transfer (${verdict.reason}). Nothing was changed.`,
        errorCode: "RPC_FAILED",
      },
      409
    );
  }

  const { error } = await supabase.rpc("confirm_ownership_transfer", {
    p_warehouse_id: warehouseId,
    p_new_owner_id: newOwnerId,
    p_tx_hash: txHash,
  });
  if (error) return fromPostgrestError(error.message);
  return ok({ data: { newOwnerWallet: verdict.newOwner } });
}
