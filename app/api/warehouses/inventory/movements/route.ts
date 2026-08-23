import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";
import {
  hasPermission,
  PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  applyMovementSchema,
  approveAdjustmentSchema,
  rejectAdjustmentSchema,
} from "@/lib/validators/inventory";
import {
  forbidden,
  fromPostgrestError,
  getMemberRole,
  invalid,
  json,
  notFound,
  ok,
  readJson,
  requireRateLimit,
  requireUser,
  serverError,
} from "@/lib/api-handler";
import { hashProofPayload } from "@/lib/proof/hash";
import { buildProofPayload } from "@/lib/proof/payload";
import { publishProofJob } from "@/lib/proof/qstash";

/**
 * Stock movement server flow (P1 Step 4 + Step 5 proof hook).
 * Semua mutasi stock lewat `apply_stock_movement` RPC (security definer).
 *
 * Proof (Step 5): saat warehouse sudah di-deploy (contract_address terisi),
 * Route Handler membangun payload proof (JCS + Keccak-256) dan mengirimkannya
 * ke RPC — baris `proofs`+`proof_outbox` dibuat DALAM TRANSAKSI yang sama
 * dengan movement. Setelah commit, job QStash di-publish (bukan menunggu
 * on-chain). `proofPending` direspons jujur dari status outbox.
 *
 * POST /api/warehouses/inventory/movements?action=apply|approve|reject
 */

type Action = "apply" | "approve" | "reject";

const ACTION_VALUES: Action[] = ["apply", "approve", "reject"];

const STOCK_PERMISSION: Record<string, Permission> = {
  stock_in: PERMISSIONS.STOCK_IN,
  stock_out: PERMISSIONS.STOCK_OUT,
  adjustment: PERMISSIONS.STOCK_ADJUSTMENT,
  reversal: PERMISSIONS.STOCK_REVERSAL,
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Publish job QStash untuk proof yang baru dibuat (setelah commit). */
async function publishProofAfterCommit(
  supabase: Supabase,
  movementId: string,
  expectedPending: boolean
): Promise<void> {
  if (!expectedPending) return;
  const { data } = await supabase
    .from("proofs")
    .select("id")
    .eq("movement_id", movementId)
    .maybeSingle();
  if (!data) {
    logger.warn(
      { movementId },
      "proof_pending=true tapi baris proof tidak ditemukan"
    );
    return;
  }
  try {
    await publishProofJob(data.id);
  } catch (err) {
    // Reconciliation harian adalah safety net bila publish gagal di sini.
    logger.error(
      { err, proofId: data.id, movementId },
      "publishProofJob gagal"
    );
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") as Action | null;

  if (!action || !ACTION_VALUES.includes(action)) {
    return invalid("Unknown action.");
  }

  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const rateLimited = await requireRateLimit(
    "stock-movement",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  switch (action) {
    case "apply": {
      const parsed = applyMovementSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

      const role = await getMemberRole(
        supabase,
        parsed.data.warehouseId,
        auth.user.id
      );
      if (!role) return forbidden("Not a member of this warehouse.");
      const permission = STOCK_PERMISSION[parsed.data.movementType];
      if (!permission || !hasPermission(role, permission)) {
        return forbidden("Insufficient permission.");
      }

      // Data untuk payload proof (hanya bila warehouse sudah di-deploy).
      const [warehouse, product] = await Promise.all([
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
      const contractAddress = warehouse.data?.contract_address;
      const movementId = randomUUID();

      let proofPayload: unknown = null;
      let proofPayloadHash: string | null = null;
      if (contractAddress && product.data) {
        const payload = buildProofPayload({
          movementId,
          warehouseId: parsed.data.warehouseId,
          warehouseAddress: contractAddress,
          productId: parsed.data.productId,
          sku: product.data.sku,
          unit: product.data.unit,
          movementType: parsed.data.movementType,
          quantity: parsed.data.quantity,
          reason: parsed.data.reason || null,
          reference: parsed.data.reference || null,
          actorUserId: auth.user.id,
          actorWallet: parsed.data.actorWallet,
          expectedBalanceVersion: parsed.data.expectedBalanceVersion,
          occurredAt: new Date().toISOString(),
        });
        proofPayload = payload;
        proofPayloadHash = hashProofPayload(payload);
      }

      const { data, error } = await supabase.rpc("apply_stock_movement", {
        p_warehouse_id: parsed.data.warehouseId,
        p_product_id: parsed.data.productId,
        p_movement_type: parsed.data.movementType,
        p_quantity: parsed.data.quantity,
        p_expected_balance_version: parsed.data.expectedBalanceVersion,
        p_reason: parsed.data.reason || null,
        p_reference: parsed.data.reference || null,
        p_reversal_of: parsed.data.reversalOf,
        p_idempotency_key: parsed.data.idempotencyKey || null,
        p_actor_wallet: parsed.data.actorWallet,
        p_movement_id: movementId,
        p_proof_payload: proofPayload,
        p_proof_payload_hash: proofPayloadHash,
      });

      if (error) {
        logger.warn({ err: error.message }, "apply_stock_movement rejected");
        return serverError(error.message);
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row?.error_code) {
        const status =
          row.error_code === "INSUFFICIENT_STOCK" ||
          row.error_code === "STALE_STOCK"
            ? 409
            : 400;
        return json(
          { ok: false, error: row.message, errorCode: row.error_code },
          status
        );
      }

      // Publish job hanya untuk movement BARU (bukan idempotent).
      const proofPending = row?.proof_pending === true;
      if (proofPending && !row.error_code) {
        await publishProofAfterCommit(supabase, row.movement_id, proofPending);
      }

      return ok(
        {
          movementId: row.movement_id,
          balanceVersion: row.balance_version,
          proofPending,
        },
        200
      );
    }

    case "approve": {
      const parsed = approveAdjustmentSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

      const movement = await supabase
        .from("stock_movements")
        .select(
          "id, warehouse_id, product_id, movement_type, quantity, reason, reference, actor_user_id, actor_wallet, expected_balance_version"
        )
        .eq("id", parsed.data.movementId)
        .maybeSingle();
      if (!movement.data) return notFound("Movement not found.");

      const [warehouse, product] = await Promise.all([
        supabase
          .from("warehouses")
          .select("contract_address")
          .eq("id", movement.data.warehouse_id)
          .maybeSingle(),
        supabase
          .from("products")
          .select("sku, unit")
          .eq("id", movement.data.product_id)
          .eq("warehouse_id", movement.data.warehouse_id)
          .maybeSingle(),
      ]);

      const contractAddress = warehouse.data?.contract_address;
      let proofPayload: unknown = null;
      let proofPayloadHash: string | null = null;
      if (contractAddress && product.data && movement.data.actor_user_id) {
        const payload = buildProofPayload({
          movementId: movement.data.id,
          warehouseId: movement.data.warehouse_id,
          warehouseAddress: contractAddress,
          productId: movement.data.product_id,
          sku: product.data.sku,
          unit: product.data.unit,
          movementType: movement.data.movement_type,
          quantity: String(movement.data.quantity),
          reason: movement.data.reason ?? null,
          reference: movement.data.reference ?? null,
          actorUserId: movement.data.actor_user_id,
          actorWallet: movement.data.actor_wallet ?? null,
          expectedBalanceVersion:
            movement.data.expected_balance_version != null
              ? String(movement.data.expected_balance_version)
              : null,
          occurredAt: new Date().toISOString(),
        });
        proofPayload = payload;
        proofPayloadHash = hashProofPayload(payload);
      }

      const { data, error } = await supabase.rpc("approve_stock_adjustment", {
        p_movement_id: parsed.data.movementId,
        p_proof_payload: proofPayload,
        p_proof_payload_hash: proofPayloadHash,
      });
      if (error) return fromPostgrestError(error.message);

      if (proofPayload) {
        await publishProofAfterCommit(supabase, parsed.data.movementId, true);
      }
      return ok(data);
    }

    case "reject": {
      const parsed = rejectAdjustmentSchema.safeParse(raw.body);
      if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

      const { data, error } = await supabase.rpc("reject_stock_adjustment", {
        p_movement_id: parsed.data.movementId,
        p_reason: parsed.data.reason || null,
      });
      if (error) return fromPostgrestError(error.message);
      return ok(data);
    }
  }
}
