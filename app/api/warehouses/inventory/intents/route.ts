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
import { createChainTransport, baseSepolia } from "@/lib/blockchain/chains";
import {
  verifyIntentProofTx,
  warehouseProofAbi,
} from "@/lib/blockchain/intent-proof";
import { buildProofPayload } from "@/lib/proof/payload";
import { hashProofPayload } from "@/lib/proof/hash";
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
};

type IntentRow = {
  id: string;
  warehouse_id: string;
  product_id: string;
  actor_wallet: string;
  payload: unknown;
  payload_hash: string;
  status: string;
  tx_hash: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;
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
    if (!parsed.data.actorWallet)
      return invalid("Connect a Base Sepolia wallet before recording stock.");
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

    // Audit C-02: tolak bila warehouse suspended/inactive.
    const inactive = await requireActiveWarehouse(
      supabase,
      parsed.data.warehouseId
    );
    if (inactive) return inactive;

    const [{ data: warehouse }, { data: product }] = await Promise.all([
      supabase
        .from("warehouses")
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
      actorWallet: parsed.data.actorWallet,
      expectedBalanceVersion: parsed.data.expectedBalanceVersion,
      occurredAt,
    });
    const payloadHash = hashProofPayload(payload);
    const { data, error: rpcError } = await supabase.rpc(
      "create_user_paid_stock_intent",
      {
        p_id: intentId,
        p_warehouse_id: parsed.data.warehouseId,
        p_product_id: parsed.data.productId,
        p_movement_type: parsed.data.movementType,
        p_quantity: parsed.data.quantity,
        p_expected_balance_version: parsed.data.expectedBalanceVersion
          ? BigInt(parsed.data.expectedBalanceVersion)
          : null,
        p_reason: parsed.data.reason || null,
        p_reference: parsed.data.reference || null,
        p_actor_wallet: parsed.data.actorWallet,
        p_idempotency_key: parsed.data.idempotencyKey || randomUUID(),
        p_payload: payload,
        p_payload_hash: payloadHash,
      }
    );
    if (rpcError || !data) {
      const code = rpcError?.message ?? "";
      return error(
        INTENT_RPC_MESSAGES[code] ??
          "Unable to prepare stock transaction. Please try again.",
        "RPC_FAILED",
        500
      );
    }
    const intent = data as IntentRow;
    const calldata = encodeFunctionData({
      abi: warehouseProofAbi,
      functionName: "recordProof",
      args: [
        keccak256(toBytes(intent.id)),
        intent.payload_hash as Hex,
        intent.actor_wallet as Hex,
        parsed.data.movementType,
        BigInt(Math.floor(Date.parse(occurredAt) / 1000)),
        toHex(toBytes(intent.id)),
      ],
    });
    return ok({
      intentId: intent.id,
      to: warehouse.contract_address,
      data: calldata,
      chainId: baseSepolia.id,
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
      .select("warehouse_id")
      .eq("id", body.intentId)
      .maybeSingle();
    if (!intentWh) return error("Stock intent not found.", "NOT_FOUND", 404);
    // Audit C-02: tolak bila warehouse suspended/inactive.
    const inactive = await requireActiveWarehouse(
      supabase,
      intentWh.warehouse_id
    );
    if (inactive) return inactive;
    const { error: rpcError } = await supabase.rpc(
      "submit_user_paid_stock_intent",
      { p_id: body.intentId, p_tx_hash: body.txHash }
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
      .select("id, actor_wallet, payload_hash, warehouse_id, status, tx_hash")
      .eq("id", body.intentId)
      .maybeSingle();
    if (intentError || !intent) {
      return error("Stock intent not found.", "NOT_FOUND", 404);
    }
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
      .from("warehouses")
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
      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash: intent.tx_hash as Hex }),
        client.getTransactionReceipt({ hash: intent.tx_hash as Hex }),
      ]);
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
    const { data, error: rpcError } = await supabase.rpc(
      "commit_user_paid_stock_intent",
      { p_id: body.intentId }
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
