import { randomUUID } from "node:crypto";

import { createPublicClient, type Hex } from "viem";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import {
  resolveOwnershipTransferExpectation,
  verifyOwnershipTransferCall,
  verifyOwnershipTransferTx,
} from "@/lib/blockchain/ownership-proof";
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
  transferResumeSchema,
} from "@/lib/validators/membership";
import {
  error,
  forbidden,
  fromPostgrestError,
  invalid,
  json,
  notFound,
  ok,
  readJson,
  requirePermission,
  requireRateLimit,
  requireUser,
  serverError,
} from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { MIN_PROOF_CONFIRMATIONS } from "@/lib/constants";

/**
 * RBAC server flow (P1 Step 3b). Semua mutasi membership/join_request lewat
 * sini → RPC security definer (RLS deny by default; otorisasi matrix
 * `canAssignRole` ditegakkan di dalam fungsi DB).
 *
 * POST /api/warehouses/membership?action=request|approve|reject|cancel|leave|remove|change_role|transfer|transfer_preview|transfer_resume|transfer_confirm
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
  | "transfer_resume"
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
  "transfer_resume",
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
      action === "transfer_resume" ||
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
  if (
    action === "transfer_preview" ||
    action === "transfer_resume" ||
    action === "transfer_confirm"
  ) {
    return handleOnchainTransfer(auth.user.id, action, raw.body);
  }

  const fn: Record<
    Exclude<
      Action,
      "transfer_preview" | "transfer_resume" | "transfer_confirm"
    >,
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
    Exclude<
      Action,
      "transfer_preview" | "transfer_resume" | "transfer_confirm"
    >,
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

type OwnershipIntentRow = {
  id: string;
  warehouse_id: string;
  actor_user_id: string;
  previous_owner_wallet: string;
  new_owner_user_id: string;
  new_owner_wallet: string;
  contract_address: string;
  ownership_generation: string | number;
  status: "prepared" | "submitted" | "confirmed" | "failed" | "expired";
  idempotency_key: string;
  tx_hash: string | null;
  expires_at: string;
};

type TransferAction =
  "transfer_preview" | "transfer_resume" | "transfer_confirm";
type ServiceClient = ReturnType<typeof createServiceClient>;

function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  if (data && typeof data === "object") return data as T;
  return null;
}

function serializeOwnershipIntent(intent: OwnershipIntentRow) {
  return {
    intentId: intent.id,
    idempotencyKey: intent.idempotency_key,
    newOwnerId: intent.new_owner_user_id,
    wallet: intent.new_owner_wallet,
    contractAddress: intent.contract_address,
    generation: String(intent.ownership_generation),
    status: intent.status,
    txHash: intent.tx_hash,
    expiresAt: intent.expires_at,
  };
}

async function findOwnershipIntent(
  service: ServiceClient,
  callerId: string,
  warehouseId: string,
  newOwnerId: string,
  intentId?: string
): Promise<OwnershipIntentRow | null> {
  const base = service
    .from("ownership_transfer_intents")
    .select(
      "id, warehouse_id, actor_user_id, previous_owner_wallet, new_owner_user_id, new_owner_wallet, contract_address, ownership_generation, status, idempotency_key, tx_hash, expires_at"
    )
    .eq("warehouse_id", warehouseId)
    .eq("actor_user_id", callerId);
  const query = intentId
    ? base.eq("id", intentId)
    : base
        .eq("new_owner_user_id", newOwnerId)
        .in("status", ["prepared", "submitted", "confirmed"])
        .order("created_at", { ascending: false });
  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return firstRpcRow<OwnershipIntentRow>(data);
}

async function handleOnchainTransfer(
  callerId: string,
  action: TransferAction,
  body: unknown
) {
  const service = createServiceClient();

  if (action === "transfer_preview") {
    const parsed = transferPreviewSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    const { data, error } = await service.rpc(
      "prepare_ownership_transfer_intent",
      {
        p_warehouse_id: parsed.data.warehouseId,
        p_new_owner_id: parsed.data.newOwnerId,
        p_actor_user_id: callerId,
        p_idempotency_key: parsed.data.idempotencyKey ?? randomUUID(),
      }
    );
    if (error) return fromPostgrestError(error.message);
    const intent = firstRpcRow<OwnershipIntentRow>(data);
    if (!intent) return serverError("Ownership intent could not be prepared.");
    return ok(serializeOwnershipIntent(intent));
  }

  if (action === "transfer_resume") {
    const parsed = transferResumeSchema.safeParse(body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    const { data, error } = await service.rpc(
      "get_active_ownership_transfer_intent",
      {
        p_warehouse_id: parsed.data.warehouseId,
        p_actor_user_id: callerId,
      }
    );
    if (error) return fromPostgrestError(error.message);
    const intent = firstRpcRow<OwnershipIntentRow>(data);
    return ok({ intent: intent ? serializeOwnershipIntent(intent) : null });
  }

  const parsed = transferConfirmSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { warehouseId, newOwnerId, txHash, intentId } = parsed.data;

  const { data: persistedWarehouse } = await service
    .from("warehouses")
    .select("owner_user_id")
    .eq("id", warehouseId)
    .maybeSingle();
  if (persistedWarehouse?.owner_user_id === newOwnerId) {
    const { data: transferEvidence } = await service
      .from("audit_logs")
      .select("id")
      .eq("action", "ownership_transferred")
      .eq("entity", "warehouses")
      .eq("entity_id", warehouseId)
      .eq("actor_user_id", callerId)
      .eq("related_tx_hash", txHash)
      .contains("after_state", { new_owner_id: newOwnerId })
      .maybeSingle();
    if (!transferEvidence) {
      return error(
        "Ownership transfer evidence was not found. Nothing was changed.",
        "FORBIDDEN",
        403
      );
    }
    const [{ data: targetMembership }, { data: targetWallet }] =
      await Promise.all([
        service
          .from("memberships")
          .select("role, status")
          .eq("warehouse_id", warehouseId)
          .eq("user_id", newOwnerId)
          .maybeSingle(),
        service
          .from("wallets")
          .select("address")
          .eq("user_id", newOwnerId)
          .eq("is_primary", true)
          .eq("verification_state", "verified")
          .maybeSingle(),
      ]);
    if (
      targetMembership?.role !== "OWNER" ||
      targetMembership.status !== "ACTIVE" ||
      !targetWallet?.address
    ) {
      return invalid("Target member wallet is no longer available.");
    }
    return ok({
      intentId: intentId ?? null,
      newOwnerWallet: String(targetWallet.address).toLowerCase(),
      recovered: true,
    });
  }

  let intent = await findOwnershipIntent(
    service,
    callerId,
    warehouseId,
    newOwnerId,
    intentId
  );
  if (!intent && intentId) {
    return error(
      "Ownership transfer intent was not found or does not belong to this request.",
      "OWNERSHIP_INTENT_CONFLICT",
      409
    );
  }
  if (!intent) {
    const { data, error } = await service.rpc(
      "prepare_ownership_transfer_intent",
      {
        p_warehouse_id: warehouseId,
        p_new_owner_id: newOwnerId,
        p_actor_user_id: callerId,
        p_idempotency_key: randomUUID(),
      }
    );
    if (error) return fromPostgrestError(error.message);
    intent = firstRpcRow<OwnershipIntentRow>(data);
  }
  if (!intent) return notFound("Ownership transfer intent was not found.");
  if (
    intent.warehouse_id !== warehouseId ||
    intent.new_owner_user_id !== newOwnerId
  ) {
    return error(
      "Ownership transfer intent does not match this request.",
      "OWNERSHIP_INTENT_CONFLICT",
      409
    );
  }
  if (intent.status === "confirmed") {
    const { data: currentWarehouse } = await service
      .from("warehouses")
      .select("owner_user_id")
      .eq("id", warehouseId)
      .maybeSingle();
    if (currentWarehouse?.owner_user_id !== newOwnerId) {
      return error(
        "Ownership state is inconsistent. Nothing was changed.",
        "STALE_GENERATION",
        409
      );
    }
    return ok({
      intentId: intent.id,
      newOwnerWallet: intent.new_owner_wallet,
      recovered: true,
    });
  }
  if (intent.status === "failed" || intent.status === "expired") {
    return json(
      {
        ok: false,
        error: "This ownership transfer intent is no longer active.",
        errorCode: "OWNERSHIP_INTENT_EXPIRED",
      },
      409
    );
  }

  const expectation = {
    contractAddress: intent.contract_address,
    currentOwnerWallet: intent.previous_owner_wallet,
    newOwnerWallet: intent.new_owner_wallet,
  };
  const client = createPublicClient({
    chain: baseSepolia,
    transport: createChainTransport(),
  });

  let tx: { to: string | null; from: string; input: Hex };
  try {
    const fetched = await client.getTransaction({ hash: txHash as Hex });
    tx = { to: fetched.to, from: fetched.from, input: fetched.input };
  } catch {
    return json(
      {
        ok: false,
        error: "Transaction not found or still confirming. Try again shortly.",
        errorCode: "CONFIRMING",
      },
      202
    );
  }

  const callVerdict = verifyOwnershipTransferCall(tx, expectation);
  if (!callVerdict.ok) {
    return json(
      {
        ok: false,
        error: `Wallet transaction is not a valid ownership transfer (${callVerdict.reason}). Nothing was changed.`,
        errorCode: "RPC_FAILED",
      },
      409
    );
  }

  const { error: recordError } = await service.rpc(
    "record_ownership_transfer_tx",
    {
      p_intent_id: intent.id,
      p_actor_user_id: callerId,
      p_tx_hash: txHash,
    }
  );
  if (recordError) return fromPostgrestError(recordError.message);

  let receipt: { status: string | undefined };
  let confirmationCount = 0;
  let onChainOwnerAfter: string | undefined;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    confirmationCount = Number(
      (await client.getTransactionConfirmations({ hash: txHash as Hex })) ?? 0
    );
    if (confirmationCount >= MIN_PROOF_CONFIRMATIONS) {
      onChainOwnerAfter = (await client.readContract({
        address: intent.contract_address as Hex,
        abi: OWNER_READ_ABI,
        functionName: "owner",
      })) as string;
    }
  } catch {
    return json(
      {
        ok: false,
        error: "Transaction is still confirming. Try again shortly.",
        errorCode: "CONFIRMING",
      },
      202
    );
  }

  if (receipt.status === "reverted") {
    await service.rpc("fail_ownership_transfer_intent", {
      p_intent_id: intent.id,
      p_actor_user_id: callerId,
      p_error: "transaction reverted",
    });
    return json(
      {
        ok: false,
        error: "Ownership transfer transaction reverted. Nothing was changed.",
        errorCode: "RPC_FAILED",
      },
      409
    );
  }
  if (receipt.status !== "success") {
    return json(
      {
        ok: false,
        error: "Transaction is still confirming. Try again shortly.",
        errorCode: "CONFIRMING",
      },
      202
    );
  }
  if (confirmationCount < MIN_PROOF_CONFIRMATIONS || !onChainOwnerAfter) {
    return json(
      {
        ok: false,
        error: "Transaction is still confirming. Ownership was not changed.",
        errorCode: "CONFIRMING",
      },
      202
    );
  }

  const resolved = resolveOwnershipTransferExpectation({
    contractAddress: intent.contract_address,
    dbOwnerWallet: intent.previous_owner_wallet,
    onChainOwnerAfter,
    targetWallet: intent.new_owner_wallet,
  });
  if (!resolved.ok) {
    return json(
      {
        ok: false,
        error: `Wallet transaction is not a valid ownership transfer (${resolved.reason}). Nothing was changed.`,
        errorCode: "RPC_FAILED",
      },
      409
    );
  }

  const verdict = verifyOwnershipTransferTx(
    { ...tx, status: receipt.status },
    resolved.expectation
  );
  if (!verdict.ok) {
    await service.rpc("fail_ownership_transfer_intent", {
      p_intent_id: intent.id,
      p_actor_user_id: callerId,
      p_error: verdict.reason,
    });
    return json(
      {
        ok: false,
        error: `Wallet transaction is not a valid ownership transfer (${verdict.reason}). Nothing was changed.`,
        errorCode: "RPC_FAILED",
      },
      409
    );
  }

  const { error: rpcError } = await service.rpc(
    "confirm_ownership_transfer_intent",
    {
      p_intent_id: intent.id,
      p_warehouse_id: warehouseId,
      p_new_owner_id: newOwnerId,
      p_tx_hash: txHash,
      p_actor_user_id: callerId,
    }
  );
  if (rpcError) return fromPostgrestError(rpcError.message);
  return ok({
    intentId: intent.id,
    newOwnerWallet: verdict.newOwner,
    recovered: false,
  });
}
