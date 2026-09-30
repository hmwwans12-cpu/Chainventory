import { randomUUID } from "node:crypto";

import type { Hex } from "viem";

import { logger } from "@/lib/logger";
import { getWarehouseFactory } from "@/lib/blockchain/contracts";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  forbidden,
  fromPostgrestError,
  invalid,
  json,
  notFound,
  ok,
  readJson,
  requireRateLimit,
  requireUser,
  serverError,
} from "@/lib/api-handler";
import {
  createWarehousePrepareSchema,
  createWarehouseRecoverySchema,
  createWarehouseSubmitSchema,
} from "@/lib/validators/warehouse";
import {
  buildDeploymentTypedData,
  DEPLOYMENT_EXPIRY_MAX_SECONDS,
  DEPLOYMENT_EXPIRY_SECONDS,
  deploymentErrorMessage,
  extractDeploymentRevertReason,
  generateWarehouseCode,
  warehouseCodeHash,
  verifyDeploymentSignature,
  type DeploymentAuthorizationMessage,
} from "@/lib/warehouses/create";
import {
  readDeploymentNonce,
  readHasActiveWarehouse,
  prepareDeployWarehouseRelay,
  broadcastPreparedWarehouseRelay,
  rebroadcastPreparedWarehouseRelay,
  simulateDeployWarehouse,
} from "@/lib/warehouses/chain";
import { finalizeIfMined } from "@/lib/warehouses/deployment-finalize";

/**
 * Create Warehouse server flow (P1 Step 1 sisa) — PRD §6.4/§7, ARSITEKTUR §5.
 *
 * `prepare` → validasi user + metadata, baca deploymentNonce LIVE dari Factory,
 * generate warehouse code + idempotencyKey + expiry, kembalikan typed data
 * EIP-712 untuk di-sign user (Privy). Stateless — tidak menyimpan apa pun.
 *
 * `submit` → terima signature, VERIFIKASI EIP-712, re-baca nonce (stale check),
 * cek one-active-warehouse on-chain, simulasikan tx (revert → 409 jelas),
 * catat klaim atomik (warehouses + deployment + OWNER membership) lewat RPC,
 * relay via treasury, catat `submitted` lalu return 202 SEGERA (PRD §6.4/§15:
 * konfirmasi async, tidak block request). Finalisasi confirmed/reverted
 * terjadi saat retry idempotent (finalizeIfMined) / job konfirmasi.
 *
 * `idempotencyKey` (DB, TTL 24 jam) TIDAK menggantikan `deploymentNonce`
 * on-chain — Invariant D (PRD §7.5).
 */

type Action = "prepare" | "submit" | "recover";
const ACTION_VALUES: Action[] = ["prepare", "submit", "recover"];

// Selaras dengan client poll 24×5s=120s di create-warehouse-form.tsx.
// Temuan audit segar: Vercel Hobby membatasi durasi fungsi 60 detik —
// maxDuration 120 berisiko ditolak saat deploy. 60s cukup (finalisasi
// 45s di jalur retry + reconcile harian sebagai fallback).
export const maxDuration = 60;

type Supabase = Awaited<ReturnType<typeof createClient>>;

function serializeTypedData(
  typedData: ReturnType<typeof buildDeploymentTypedData>
) {
  const message = typedData.message as DeploymentAuthorizationMessage;
  return {
    domain: {
      name: typedData.domain.name,
      version: typedData.domain.version,
      chainId: String(typedData.domain.chainId),
      verifyingContract: typedData.domain.verifyingContract,
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: {
      owner: message.owner,
      warehouseCodeHash: message.warehouseCodeHash,
      deploymentNonce: String(message.deploymentNonce),
      expiry: String(message.expiry),
    },
  };
}

/** Wallet primary user (ARSITEKTUR §4.4) — pemilik on-chain warehouse. */
async function primaryWallet(
  supabase: Supabase,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("wallets")
    .select("address")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .eq("verification_state", "verified")
    .maybeSingle();
  return data?.address ?? null;
}

async function ensureNoActiveWarehouse(
  supabase: Supabase,
  userId: string
): Promise<"ok" | "has-active"> {
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data ? "has-active" : "ok";
}

type ExistingDeployment = {
  id: string;
  status: string;
  tx_hash: string | null;
  warehouse_id: string | null;
  factory_address?: string | null;
  chain_id?: number | string | null;
  relay_payload?: string | null;
};

async function respondWithExistingDeployment(
  supabase: Supabase,
  service: Supabase,
  existing: ExistingDeployment,
  userId: string,
  fallbackWarehouseCode: string
) {
  if (existing.warehouse_id) {
    const { data: owner, error: ownerError } = await service
      .from("warehouses")
      .select("owner_user_id")
      .eq("id", existing.warehouse_id)
      .maybeSingle();
    if (ownerError) {
      return serverError("Could not verify deployment ownership.");
    }
    if (owner?.owner_user_id !== userId) {
      return forbidden("You do not have access to this deployment.");
    }
  }
  const { data: relayRow, error: relayError } = await service
    .from("warehouse_deployments")
    .select("tx_hash, factory_address, chain_id, relay_payload")
    .eq("id", existing.id)
    .maybeSingle();
  if (relayError) {
    return serverError("Could not read deployment relay metadata.");
  }
  const relay = { ...existing, ...(relayRow ?? {}) };
  if (
    relay.tx_hash &&
    relay.relay_payload &&
    relay.factory_address &&
    relay.chain_id
  ) {
    try {
      await rebroadcastPreparedWarehouseRelay({
        txHash: relay.tx_hash as Hex,
        rawTransaction: relay.relay_payload as Hex,
        factoryAddress: relay.factory_address as Hex,
        chainId: Number(relay.chain_id),
      });
    } catch (err) {
      logger.warn(
        { err, deploymentId: existing.id },
        "deployment relay rebroadcast failed; finalization will retry"
      );
    }
  }
  await finalizeIfMined(supabase, service, relay, userId);
  const { data: settledDeployment, error: settledError } = await service
    .from("warehouse_deployments")
    .select("id, status, tx_hash, warehouse_id")
    .eq("id", existing.id)
    .maybeSingle();
  if (settledError) {
    return serverError("Could not read deployment status.");
  }
  const current = settledDeployment ?? existing;
  const { data: warehouse } = current.warehouse_id
    ? await service
        .from("warehouses")
        .select("contract_address, warehouse_code")
        .eq("id", current.warehouse_id)
        .maybeSingle()
    : { data: null };
  const { data: summary } = current.warehouse_id
    ? await service
        .from("warehouse_summaries")
        .select("warehouse_code")
        .eq("id", current.warehouse_id)
        .maybeSingle()
    : { data: null };
  return ok({
    status: current.status,
    deploymentId: current.id,
    warehouseId: current.warehouse_id,
    warehouseCode:
      summary?.warehouse_code ??
      warehouse?.warehouse_code ??
      fallbackWarehouseCode,
    txHash: current.tx_hash,
    contractAddress: warehouse?.contract_address ?? null,
  });
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

  const isDeploymentPoll =
    action === "submit" && url.searchParams.get("poll") === "1";
  const rateLimited = isDeploymentPoll
    ? await requireRateLimit("warehouse-create-finalize", auth.user.id, request)
    : await requireRateLimit("warehouse-create", auth.user.id, request);
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  if (action === "recover") {
    const parsed = createWarehouseRecoverySchema.safeParse(raw.body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    const service = createServiceClient();
    const { data: deployment } = await service
      .from("warehouse_deployments")
      .select(
        "id, status, tx_hash, warehouse_id, factory_address, chain_id, relay_payload"
      )
      .eq("id", parsed.data.deploymentId)
      .maybeSingle();
    if (!deployment?.warehouse_id) return notFound("Deployment not found.");
    const { data: warehouse } = await service
      .from("warehouses")
      .select("owner_user_id")
      .eq("id", deployment.warehouse_id)
      .maybeSingle();
    if (warehouse?.owner_user_id !== auth.user.id) {
      return forbidden("You do not have access to this deployment.");
    }
    if (deployment.status === "confirmed") {
      return ok({
        deploymentId: deployment.id,
        status: deployment.status,
        txHash: deployment.tx_hash,
      });
    }
    if (deployment.status !== "pending" && deployment.status !== "submitted") {
      return invalid("This deployment is no longer recoverable.");
    }
    if (
      deployment.tx_hash &&
      deployment.tx_hash.toLowerCase() !== parsed.data.txHash.toLowerCase()
    ) {
      return invalid(
        "The recovery transaction hash does not match the deployment."
      );
    }
    const txHash = deployment.tx_hash ?? parsed.data.txHash;
    if (
      deployment.relay_payload &&
      deployment.factory_address &&
      deployment.chain_id
    ) {
      try {
        await rebroadcastPreparedWarehouseRelay({
          txHash: txHash as Hex,
          rawTransaction: deployment.relay_payload as Hex,
          factoryAddress: deployment.factory_address as Hex,
          chainId: Number(deployment.chain_id),
        });
      } catch (err) {
        logger.warn(
          { err, deploymentId: deployment.id },
          "deployment recovery relay rebroadcast failed"
        );
      }
    }
    if (deployment.status === "pending") {
      const { error: updateError } = await service.rpc(
        "update_warehouse_deployment_status",
        {
          p_deployment_id: deployment.id,
          p_status: "submitted",
          p_tx_hash: txHash,
          p_error: null,
          p_actor_user_id: auth.user.id,
        }
      );
      if (updateError) return fromPostgrestError(updateError.message);
    }
    await finalizeIfMined(
      undefined,
      service,
      { ...deployment, tx_hash: txHash },
      auth.user.id
    );
    const { data: settled } = await service
      .from("warehouse_deployments")
      .select("status, tx_hash")
      .eq("id", deployment.id)
      .maybeSingle();
    return json(
      {
        ok: true,
        data: {
          deploymentId: deployment.id,
          status: settled?.status ?? "submitted",
          txHash: settled?.tx_hash ?? txHash,
        },
      },
      settled?.status === "confirmed" ? 200 : 202
    );
  }

  if (action === "prepare") {
    const parsed = createWarehousePrepareSchema.safeParse(raw.body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

    const owner = await primaryWallet(supabase, auth.user.id);
    if (!owner) {
      return invalid("Verify your wallet before creating a warehouse.");
    }

    let factory;
    try {
      factory = getWarehouseFactory();
    } catch {
      return serverError("Warehouse factory is not configured.");
    }

    let nonce: bigint;
    let hasActive: boolean;
    try {
      [nonce, hasActive] = await Promise.all([
        readDeploymentNonce(owner as Hex),
        readHasActiveWarehouse(owner as Hex),
      ]);
    } catch (err) {
      logger.error({ err }, "create prepare on-chain read failed");
      return serverError("Could not reach the blockchain. Try again.");
    }

    if (hasActive) {
      return json(
        {
          ok: false,
          error: "You already have an active warehouse on-chain.",
          errorCode: "CONFLICT",
        },
        409
      );
    }

    if (
      (await ensureNoActiveWarehouse(supabase, auth.user.id)) === "has-active"
    ) {
      return json(
        {
          ok: false,
          error: "You already have an active warehouse.",
          errorCode: "CONFLICT",
        },
        409
      );
    }

    const warehouseCode = generateWarehouseCode();
    const idempotencyKey = randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    const expiry = nowSec + DEPLOYMENT_EXPIRY_SECONDS;

    const message: DeploymentAuthorizationMessage = {
      owner: owner as Hex,
      warehouseCodeHash: warehouseCodeHash(warehouseCode),
      deploymentNonce: String(nonce),
      expiry: String(expiry),
    };

    const typedData = buildDeploymentTypedData({
      factoryAddress: factory.address,
      chainId: factory.chainId,
      message,
    });

    return ok({
      owner,
      warehouseCode,
      idempotencyKey,
      expiresAt: expiry,
      deploymentNonce: String(nonce),
      typedData: serializeTypedData(typedData),
    });
  }

  // ---- submit ----
  const parsed = createWarehouseSubmitSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const owner = parsed.data.owner as Hex;
  const signature = parsed.data.signature as Hex;

  if (isDeploymentPoll) {
    const { data: polledDeployment } = await supabase
      .from("warehouse_deployments")
      .select("id, status, tx_hash, warehouse_id")
      .eq("idempotency_key", parsed.data.idempotencyKey)
      .maybeSingle();
    if (!polledDeployment) return notFound("Deployment not found.");
    if (polledDeployment.warehouse_id) {
      const { data: ownerCheck } = await supabase
        .from("warehouses")
        .select("id")
        .eq("id", polledDeployment.warehouse_id)
        .eq("owner_user_id", auth.user.id)
        .maybeSingle();
      if (!ownerCheck)
        return forbidden("You do not have access to this deployment.");
    }
    return respondWithExistingDeployment(
      supabase,
      createServiceClient(),
      polledDeployment,
      auth.user.id,
      parsed.data.warehouseCode
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = Number(parsed.data.expiry);
  if (expiry <= nowSec || expiry > nowSec + DEPLOYMENT_EXPIRY_MAX_SECONDS) {
    return invalid(
      "Your deployment authorization has expired. Retry the create flow."
    );
  }

  const wallet = await primaryWallet(supabase, auth.user.id);
  if (!wallet || wallet.toLowerCase() !== owner.toLowerCase()) {
    return invalid("Verify your primary wallet before creating a warehouse.");
  }

  let factory;
  try {
    factory = getWarehouseFactory();
  } catch {
    return serverError("Warehouse factory is not configured.");
  }

  // Idempotency: idempotencyKey yang sama → kembalikan state eksisting.
  // Fix BE-13: lookup di-scope ke pemohon agar penebak UUID tidak bisa baca
  // status/txHash/contractAddress deployment orang lain (info-leak) atau
  // memicu finalizeIfMined atas deployment korban. Balas 403 generik bila
  // bukan milik (tanpa membocorkan keberadaan key).
  const { data: existing } = await supabase
    .from("warehouse_deployments")
    .select("id, status, tx_hash, warehouse_id")
    .eq("idempotency_key", parsed.data.idempotencyKey)
    .maybeSingle();

  if (existing?.warehouse_id) {
    const { data: ownerCheck } = await supabase
      .from("warehouses")
      .select("id")
      .eq("id", existing.warehouse_id)
      .eq("owner_user_id", auth.user.id)
      .maybeSingle();
    if (!ownerCheck) {
      logger.warn(
        { deploymentId: existing.id },
        "deployment idempotency lookup by non-owner rejected"
      );
      return forbidden("You do not have access to this warehouse.");
    }
  }

  const service = createServiceClient();

  if (existing) {
    return respondWithExistingDeployment(
      supabase,
      service,
      existing,
      auth.user.id,
      parsed.data.warehouseCode
    );
  }

  // Nonce harus cocok dengan state live Factory (PRD §7.4 no. 1 — bukan tebakan).
  let nonce: bigint;
  let hasActive: boolean;
  try {
    [nonce, hasActive] = await Promise.all([
      readDeploymentNonce(owner),
      readHasActiveWarehouse(owner),
    ]);
  } catch (err) {
    logger.error({ err }, "create submit on-chain read failed");
    return serverError("Could not reach the blockchain. Try again.");
  }

  if (BigInt(parsed.data.deploymentNonce) !== nonce) {
    return json(
      {
        ok: false,
        error:
          "Your deployment authorization is stale. Retry the create flow to sign a fresh one.",
        errorCode: "CONFLICT",
      },
      409
    );
  }

  if (hasActive) {
    return json(
      {
        ok: false,
        error: "You already have an active warehouse on-chain.",
        errorCode: "CONFLICT",
      },
      409
    );
  }

  if (
    (await ensureNoActiveWarehouse(supabase, auth.user.id)) === "has-active"
  ) {
    return json(
      {
        ok: false,
        error: "You already have an active warehouse.",
        errorCode: "CONFLICT",
      },
      409
    );
  }

  // Integritas: kode yang ditandatangani harus konsisten dengan DB.
  if (
    warehouseCodeHash(parsed.data.warehouseCode).toLowerCase() !==
    parsed.data.warehouseCodeHash.toLowerCase()
  ) {
    return invalid("Warehouse code mismatch.");
  }

  // Verifikasi EIP-712 signature sebelum relay (PRD §7.4 no. 4).
  const typedData = buildDeploymentTypedData({
    factoryAddress: factory.address,
    chainId: factory.chainId,
    message: {
      owner,
      warehouseCodeHash: parsed.data.warehouseCodeHash as Hex,
      deploymentNonce: parsed.data.deploymentNonce,
      expiry: parsed.data.expiry,
    },
  });
  if (!(await verifyDeploymentSignature(signature, typedData, owner))) {
    return invalid("Invalid signature. Please sign again.");
  }

  const authTuple = {
    owner,
    warehouseCodeHash: parsed.data.warehouseCodeHash as Hex,
    deploymentNonce: BigInt(parsed.data.deploymentNonce),
    expiry: BigInt(parsed.data.expiry),
  };

  // Simulasi → tangkap revert (one-active/stale/expired/invalid-sig) tanpa gas.
  try {
    await simulateDeployWarehouse(authTuple, signature);
  } catch (err) {
    const reason = extractDeploymentRevertReason(err);
    logger.warn({ reason }, "create warehouse simulation rejected");
    return json(
      {
        ok: false,
        error: deploymentErrorMessage(reason),
        errorCode: "CONFLICT",
      },
      409
    );
  }

  let prepared: Awaited<ReturnType<typeof prepareDeployWarehouseRelay>>;
  try {
    prepared = await prepareDeployWarehouseRelay(authTuple, signature);
  } catch (err) {
    logger.error(
      { err },
      "deployWarehouse relay preparation failed before claim"
    );
    return serverError("Could not prepare the deployment transaction.");
  }

  // Klaim atomik (write-intent) sebelum relay.
  const { data: created, error: createError } = await service.rpc(
    "create_warehouse_and_deployment_with_relay",
    {
      p_warehouse_code: parsed.data.warehouseCode,
      p_name: parsed.data.name,
      p_company_name: parsed.data.companyName || null,
      p_warehouse_type: parsed.data.warehouseType || null,
      p_on_chain_owner_wallet: owner,
      p_factory_address: factory.address,
      p_chain_id: BigInt(factory.chainId),
      p_warehouse_code_hash: parsed.data.warehouseCodeHash,
      p_deployment_nonce: BigInt(parsed.data.deploymentNonce),
      p_expiry: BigInt(parsed.data.expiry),
      p_signature: signature,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_actor_user_id: auth.user.id,
      p_tx_hash: prepared.txHash,
      p_relay_payload: prepared.rawTransaction,
    }
  );

  if (createError) {
    const { data: racedDeployment } = await service
      .from("warehouse_deployments")
      .select("id, status, tx_hash, warehouse_id")
      .eq("idempotency_key", parsed.data.idempotencyKey)
      .maybeSingle();
    if (racedDeployment) {
      return respondWithExistingDeployment(
        supabase,
        service,
        racedDeployment,
        auth.user.id,
        parsed.data.warehouseCode
      );
    }
    if (createError.message.includes("already has an active warehouse")) {
      return json(
        {
          ok: false,
          error: "You already have an active warehouse.",
          errorCode: "CONFLICT",
        },
        409
      );
    }
    if (createError.code === "23505") {
      return json(
        {
          ok: false,
          error: "Warehouse code collision. Retry the create flow.",
          errorCode: "CONFLICT",
        },
        409
      );
    }
    logger.warn(
      { err: createError.message },
      "create_warehouse_and_deployment rejected"
    );
    return fromPostgrestError(createError.message);
  }

  const row = Array.isArray(created) ? created[0] : created;
  const warehouseId = String(row.created_warehouse_id);
  const deploymentId = String(row.created_deployment_id);

  const txHash = prepared.txHash;

  try {
    await broadcastPreparedWarehouseRelay(prepared);
  } catch (err) {
    logger.error(
      { err, warehouseId, deploymentId, txHash },
      "deployWarehouse broadcast outcome unknown"
    );
    return json(
      {
        ok: true,
        data: {
          status: "pending_confirmation",
          warehouseId,
          deploymentId,
          warehouseCode: parsed.data.warehouseCode,
          contractAddress: null,
          txHash,
        },
      },
      202
    );
  }

  logger.info(
    { warehouseId, deploymentId, txHash },
    "warehouse deployment relayed, awaiting async confirmation"
  );
  return json(
    {
      ok: true,
      data: {
        status: "submitted",
        warehouseId,
        deploymentId,
        warehouseCode: parsed.data.warehouseCode,
        contractAddress: null,
        txHash,
      },
    },
    202
  );
}
