import { randomUUID } from "node:crypto";

import {
  createPublicClient,
  encodeFunctionData,
  keccak256,
  toBytes,
  toHex,
  type Hex,
} from "viem";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createChainTransport, baseSepolia } from "@/lib/blockchain/chains";
import {
  verifyIntentProofTx,
  warehouseProofAbi,
} from "@/lib/blockchain/intent-proof";
import { buildProofPayload } from "@/lib/proof/payload";
import { isLegacyTreasuryWarehouse } from "@/lib/proof/treasury";
import { hashProofPayload } from "@/lib/proof/hash";
import { computeRequestFingerprint } from "@/lib/inventory/fingerprint";
import {
  getIntentOccurredAt,
  isIntentReplayCompatible,
  type IntentReplayRecord,
} from "@/lib/inventory/intent-replay";
import { applyMovementSchema } from "@/lib/validators/inventory";
import {
  invalid,
  ok,
  readJson,
  requireActiveWarehouse,
  requirePermission,
  requireRateLimit,
  requireUser,
  error,
} from "@/lib/api-handler";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { MIN_PROOF_CONFIRMATIONS } from "@/lib/constants";

/**
 * Pesan ramah-UX untuk exception RPC intent (mencegah teks Postgres mentah
 * bocor ke client — audit 2026-08-23).
 */
const INTENT_RPC_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Your session has expired. Please log in again.",
  FORBIDDEN: "You do not have permission to record stock in this warehouse.",
  NOT_FOUND: "Stock item or intent not found.",
  INTENT_NOT_ACTIVE:
    "This stock request expired or was already used. Start a new one.",
  WALLET_NOT_VERIFIED:
    "Your wallet is not verified yet. Verify it in Settings → Wallet, then try again.",
};

type IntentRow = IntentReplayRecord & {
  id: string;
  payload_hash: string;
  status: string;
  tx_hash: string | null;
};

function getPayloadWarehouseAddress(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).warehouseAddress;
  return typeof value === "string" && value.trim() ? value : null;
}

function encodeIntentCalldata(
  intent: IntentRow,
  movementType: string,
  occurredAt: string
): string {
  const timestamp = Math.floor(Date.parse(occurredAt) / 1000);
  return encodeFunctionData({
    abi: warehouseProofAbi,
    functionName: "recordProof",
    args: [
      keccak256(toBytes(intent.id)),
      intent.payload_hash as Hex,
      intent.actor_wallet as Hex,
      movementType,
      BigInt(timestamp),
      toHex(toBytes(intent.id)),
    ],
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;
  const service = createServiceClient();
  const rateLimited = await requireRateLimit(
    "stock-intent",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;
  const action = new URL(request.url).searchParams.get("action");
  const raw = await readJson(request);
  if (!raw.ok || !raw.body || typeof raw.body !== "object")
    return invalid("Invalid JSON body.");

  if (action === "prepare") {
    const parsed = applyMovementSchema.safeParse(raw.body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    if (!["stock_in", "stock_out"].includes(parsed.data.movementType))
      return invalid("Only Stock In and Stock Out use a wallet-paid proof.");
    const denied = await requirePermission(
      supabase,
      parsed.data.warehouseId,
      auth.user.id,
      parsed.data.movementType === "stock_in"
        ? PERMISSIONS.STOCK_IN
        : PERMISSIONS.STOCK_OUT
    );
    if (denied) return denied;

    const inactive = await requireActiveWarehouse(
      supabase,
      parsed.data.warehouseId
    );
    if (inactive) return inactive;

    const idempotencyKey = parsed.data.idempotencyKey?.trim() || "";
    if (!idempotencyKey) {
      return invalid("idempotencyKey is required for stock intents.");
    }

    let expectedBalanceVersionBig: bigint | null = null;
    if (parsed.data.expectedBalanceVersion) {
      if (parsed.data.expectedBalanceVersion.length > 20) {
        return invalid("Version number is too large.");
      }
      try {
        expectedBalanceVersionBig = BigInt(parsed.data.expectedBalanceVersion);
      } catch {
        return invalid("Invalid version.");
      }
    }

    const { data: existingIntent, error: existingIntentError } = await supabase
      .from("stock_intents")
      .select(
        "id, warehouse_id, product_id, movement_type, quantity, expected_balance_version, reason, reference, actor_wallet, payload, payload_hash, status, tx_hash, created_at, request_fingerprint"
      )
      .eq("actor_user_id", auth.user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingIntentError) {
      return error(
        "Unable to read the existing stock request. Please try again.",
        "RPC_FAILED",
        500
      );
    }
    if (existingIntent) {
      const intent = existingIntent as unknown as IntentRow;
      const storedReplayFingerprint = computeRequestFingerprint({
        warehouseId: parsed.data.warehouseId,
        productId: parsed.data.productId,
        movementType: parsed.data.movementType,
        quantity: parsed.data.quantity,
        expectedBalanceVersion: parsed.data.expectedBalanceVersion,
        reason: parsed.data.reason || null,
        reference: parsed.data.reference || null,
        reversalOf: null,
        actorWallet: intent.actor_wallet,
      });
      const compatible = isIntentReplayCompatible(
        intent,
        {
          actorUserId: auth.user.id,
          warehouseId: parsed.data.warehouseId,
          productId: parsed.data.productId,
          movementType: parsed.data.movementType,
          quantity: parsed.data.quantity,
          expectedBalanceVersion: parsed.data.expectedBalanceVersion,
          reason: parsed.data.reason || null,
          reference: parsed.data.reference || null,
          actorWallet: intent.actor_wallet,
        },
        storedReplayFingerprint
      );
      if (!compatible) {
        return error(
          "This idempotency key was already used for a different stock request.",
          "IDEMPOTENCY_CONFLICT",
          409
        );
      }
      const occurredAt = getIntentOccurredAt(intent);
      const to = getPayloadWarehouseAddress(intent.payload);
      if (!to) {
        return error(
          "The existing stock request is missing its contract payload.",
          "IDEMPOTENCY_CONFLICT",
          409
        );
      }
      const timestamp = Math.floor(Date.parse(occurredAt) / 1000);
      return ok(
        {
          intentId: intent.id,
          to,
          data: encodeIntentCalldata(
            intent,
            parsed.data.movementType,
            occurredAt
          ),
          chainId: baseSepolia.id,
          actorWallet: intent.actor_wallet,
          occurredAt,
          timestamp,
          status: intent.status,
        },
        200
      );
    }

    if (!parsed.data.actorWallet) {
      return invalid("Connect a Base Sepolia wallet before recording stock.");
    }

    const { data: primaryWallet } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", auth.user.id)
      .eq("is_primary", true)
      .eq("verification_state", "verified")
      .maybeSingle();
    const actorWallet = primaryWallet?.address ?? null;
    if (!actorWallet) {
      return error(
        "Your primary verified wallet is required to prepare this stock request.",
        "FORBIDDEN",
        403
      );
    }

    const [{ data: warehouse }, { data: product }] = await Promise.all([
      supabase
        .from("warehouse_summaries")
        .select("contract_address")
        .eq("id", parsed.data.warehouseId)
        .maybeSingle(),
      supabase
        .from("products")
        .select("sku, unit")
        .eq("id", parsed.data.productId)
        .eq("warehouse_id", parsed.data.warehouseId)
        .maybeSingle(),
    ]);
    if (!warehouse?.contract_address || !product)
      return invalid(
        "This warehouse must be migrated to the v2 contract before wallet-paid stock movements are available."
      );
    try {
      if (await isLegacyTreasuryWarehouse(warehouse.contract_address)) {
        return error(
          "This warehouse uses the treasury proof flow; use a standard stock movement instead.",
          "UNSUPPORTED_PROOF_MODE",
          409
        );
      }
    } catch {
      return error(
        "Could not verify the warehouse proof mode. Try again.",
        "RPC_FAILED",
        503
      );
    }

    const intentId = randomUUID();
    const occurredAt = new Date().toISOString();
    const payload = buildProofPayload({
      movementId: intentId,
      warehouseId: parsed.data.warehouseId,
      warehouseAddress: warehouse.contract_address,
      productId: parsed.data.productId,
      sku: product.sku,
      unit: product.unit,
      movementType: parsed.data.movementType,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason || null,
      reference: parsed.data.reference || null,
      actorUserId: auth.user.id,
      actorWallet,
      expectedBalanceVersion: parsed.data.expectedBalanceVersion,
      occurredAt,
    });
    const payloadHash = hashProofPayload(payload);
    const { data, error: rpcError } = await service.rpc(
      "create_user_paid_stock_intent",
      {
        p_id: intentId,
        p_warehouse_id: parsed.data.warehouseId,
        p_product_id: parsed.data.productId,
        p_movement_type: parsed.data.movementType,
        p_quantity: parsed.data.quantity,
        p_expected_balance_version: expectedBalanceVersionBig,
        p_reason: parsed.data.reason || null,
        p_reference: parsed.data.reference || null,
        p_actor_wallet: actorWallet,
        p_idempotency_key: idempotencyKey,
        p_payload: payload,
        p_payload_hash: payloadHash,
        p_request_fingerprint: computeRequestFingerprint({
          warehouseId: parsed.data.warehouseId,
          productId: parsed.data.productId,
          movementType: parsed.data.movementType,
          quantity: parsed.data.quantity,
          expectedBalanceVersion: parsed.data.expectedBalanceVersion,
          reason: parsed.data.reason || null,
          reference: parsed.data.reference || null,
          reversalOf: null,
          actorWallet,
        }),
        p_actor_user_id: auth.user.id,
      }
    );
    if (rpcError || !data) {
      const code = rpcError?.message ?? "";
      if (code.toUpperCase().includes("IDEMPOTENCY_CONFLICT")) {
        return error(
          "This idempotency key was already used for a different stock request.",
          "IDEMPOTENCY_CONFLICT",
          409
        );
      }
      return error(
        INTENT_RPC_MESSAGES[code] ??
          "Unable to prepare stock transaction. Please try again.",
        "RPC_FAILED",
        500
      );
    }
    const intent = (Array.isArray(data) ? data[0] : data) as IntentRow;
    const storedOccurredAt = getIntentOccurredAt({
      ...intent,
      created_at: intent.created_at ?? occurredAt,
    });
    const to =
      getPayloadWarehouseAddress(intent.payload) ?? warehouse.contract_address;
    const timestamp = Math.floor(Date.parse(storedOccurredAt) / 1000);
    return ok({
      intentId: intent.id,
      to,
      data: encodeIntentCalldata(
        intent,
        parsed.data.movementType,
        storedOccurredAt
      ),
      chainId: baseSepolia.id,
      actorWallet: intent.actor_wallet,
      occurredAt: storedOccurredAt,
      timestamp,
      status: intent.status,
    });
  }

  const body = raw.body as { intentId?: string; txHash?: string };
  if (!body.intentId || typeof body.intentId !== "string")
    return invalid("Invalid intent id.");
  if (action === "submit") {
    if (!body.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash))
      return invalid("Invalid transaction hash.");
    const { data: intentWh } = await supabase
      .from("stock_intents")
      .select("warehouse_id, actor_user_id, movement_type")
      .eq("id", body.intentId)
      .maybeSingle();
    if (!intentWh) return error("Stock intent not found.", "NOT_FOUND", 404);
    // Audit v0.3.8 C-11: the previous handler skipped RBAC for submit/finalize.
    // AGENT.md §3 mandates an explicit role check at the Route Handler. The
    // intent's actor_user_id is the binding identity — only they may submit
    // their own intent (this also prevents CSRF where an unrelated
    // warehouse member learns an intent id and submits it).
    if (intentWh.actor_user_id !== auth.user.id) {
      return error(
        "You can only submit stock requests you created.",
        "FORBIDDEN",
        403
      );
    }
    const permission =
      intentWh.movement_type === "stock_in"
        ? PERMISSIONS.STOCK_IN
        : intentWh.movement_type === "stock_out"
          ? PERMISSIONS.STOCK_OUT
          : null;
    if (!permission) {
      return error("Invalid stock movement type.", "INVALID_INPUT", 400);
    }
    const denied = await requirePermission(
      supabase,
      intentWh.warehouse_id,
      auth.user.id,
      permission
    );
    if (denied) return denied;
    // Audit C-02: tolak bila warehouse suspended/inactive.
    const inactive = await requireActiveWarehouse(
      supabase,
      intentWh.warehouse_id
    );
    if (inactive) return inactive;
    const { error: rpcError } = await service.rpc(
      "submit_user_paid_stock_intent",
      {
        p_id: body.intentId,
        p_tx_hash: body.txHash,
        p_actor_user_id: auth.user.id,
      }
    );
    if (rpcError) {
      const friendly = INTENT_RPC_MESSAGES[rpcError.message];
      return error(
        friendly ?? "Unable to submit this stock request. Please try again.",
        "RPC_FAILED",
        friendly ? 400 : 500
      );
    }
    return ok({ status: "submitted" }, 202);
  }

  if (action === "finalize") {
    const { data: intent, error: intentError } = await supabase
      .from("stock_intents")
      .select(
        "id, actor_user_id, actor_wallet, payload_hash, warehouse_id, movement_type, status, tx_hash"
      )
      .eq("id", body.intentId)
      .maybeSingle();
    if (intentError || !intent) {
      return error("Stock intent not found.", "NOT_FOUND", 404);
    }
    // Audit v0.3.8 C-11: same RBAC enforcement as submit.
    if (intent.actor_user_id !== auth.user.id) {
      return error(
        "You can only finalize stock requests you created.",
        "FORBIDDEN",
        403
      );
    }
    const permission =
      intent.movement_type === "stock_in"
        ? PERMISSIONS.STOCK_IN
        : intent.movement_type === "stock_out"
          ? PERMISSIONS.STOCK_OUT
          : null;
    if (!permission) {
      return error("Invalid stock movement type.", "INVALID_INPUT", 400);
    }
    const denied = await requirePermission(
      supabase,
      intent.warehouse_id,
      auth.user.id,
      permission
    );
    if (denied) return denied;
    // Audit C-02: tolak bila warehouse suspended/inactive.
    const inactive = await requireActiveWarehouse(
      supabase,
      intent.warehouse_id
    );
    if (inactive) return inactive;
    if (intent.status === "committed")
      return ok({ movementId: intent.id, status: "committed" });
    if (!intent.tx_hash)
      return invalid("Submit the wallet transaction before finalizing.");

    // Audit N-1 (2026-08-23): receipt sukses saja TIDAK cukup. BFF wajib
    // membuktikan tx benar-benar memanggil recordProof untuk intent INI di
    // contract warehouse yang tepat, dari wallet actor — bukan tx sukses
    // apa pun (mis. transfer ETH biasa). Tanpa ini, stok bisa commit
    // tanpa proof on-chain.
    const { data: warehouse } = await supabase
      .from("warehouse_summaries")
      .select("contract_address")
      .eq("id", intent.warehouse_id)
      .maybeSingle();
    const contractAddress = warehouse?.contract_address as string | undefined;
    if (!contractAddress)
      return error(
        "Warehouse contract is not configured for this stock item.",
        "RPC_FAILED",
        409
      );
    try {
      const client = createPublicClient({
        chain: baseSepolia,
        transport: createChainTransport(),
      });
      const [tx, receipt, confirmations] = await Promise.all([
        client.getTransaction({ hash: intent.tx_hash as Hex }),
        client.getTransactionReceipt({ hash: intent.tx_hash as Hex }),
        client.getTransactionConfirmations({ hash: intent.tx_hash as Hex }),
      ]);
      if (Number(confirmations ?? 0) < MIN_PROOF_CONFIRMATIONS) {
        return error(
          "Transaction is still confirming. Inventory has not changed.",
          "CONFIRMING",
          202
        );
      }
      const verdict = verifyIntentProofTx(
        {
          to: tx.to,
          from: tx.from,
          input: tx.input,
          status: receipt.status,
        },
        {
          contractAddress,
          actorWallet: intent.actor_wallet,
          intentId: intent.id,
          // Fix BE-15: pastikan hash on-chain = hash intent tersimpan.
          // Tanpa ini modifikasi payload di DB lolos tanpa deteksi.
          payloadHash: intent.payload_hash,
        }
      );
      if (!verdict.ok)
        return error(
          `Wallet transaction is not a valid proof for this stock request (${verdict.reason}). Inventory was not changed.`,
          "RPC_FAILED",
          409
        );
    } catch {
      return error(
        "Transaction is still confirming. Inventory has not changed.",
        "RPC_FAILED",
        202
      );
    }
    const { data, error: rpcError } = await service.rpc(
      "commit_user_paid_stock_intent",
      {
        p_id: body.intentId,
        p_actor_user_id: auth.user.id,
        p_verified_tx_hash: intent.tx_hash,
        p_verified_payload_hash: intent.payload_hash,
      }
    );
    if (rpcError) {
      const friendly = INTENT_RPC_MESSAGES[rpcError.message];
      return error(
        friendly ?? "Unable to commit this stock request. Please try again.",
        "RPC_FAILED",
        friendly ? 400 : 500
      );
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.error_code)
      return error(
        row.message,
        row.error_code === "STALE_STOCK" ? "STALE_STOCK" : "RPC_FAILED",
        409
      );
    return ok({
      movementId: row?.movement_id ?? body.intentId,
      balanceVersion: row?.balance_version ?? 0,
      status: "committed",
    });
  }
  return invalid("Unsupported stock intent action.");
}
