import { randomUUID } from "node:crypto";

import type { Hex } from "viem";

import { logger } from "@/lib/logger";
import { getWarehouseFactory } from "@/lib/blockchain/contracts";
import { createClient } from "@/lib/supabase/server";
import {
  forbidden,
  fromPostgrestError,
  invalid,
  json,
  ok,
  readJson,
  requireRateLimit,
  requireUser,
  serverError,
} from "@/lib/api-handler";
import {
  createWarehousePrepareSchema,
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
  relayDeployWarehouse,
  simulateDeployWarehouse,
  waitForWarehouseDeployment,
} from "@/lib/warehouses/chain";

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

type Action = "prepare" | "submit";
const ACTION_VALUES: Action[] = ["prepare", "submit"];

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

/** Finalisasi deployment `submitted` saat retry idempotent (receipt sudah mined). */
async function finalizeIfMined(
  supabase: Supabase,
  deployment: {
    id: string;
    status: string;
    tx_hash: string | null;
    warehouse_id: string | null;
  }
): Promise<void> {
  if (
    deployment.status !== "submitted" ||
    !deployment.tx_hash ||
    !deployment.warehouse_id
  ) {
    return;
  }
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("contract_address")
    .eq("id", deployment.warehouse_id)
    .maybeSingle();
  if (!warehouse || warehouse.contract_address) return;

  const outcome = await waitForWarehouseDeployment(
    deployment.tx_hash as Hex,
    45_000
  );
  if (outcome.status === "confirmed") {
    if (outcome.warehouseAddress) {
      const { error: addrErr } = await supabase.rpc(
        "set_warehouse_contract_address",
        {
          p_warehouse_id: deployment.warehouse_id,
          p_contract_address: outcome.warehouseAddress,
        }
      );
      if (addrErr) {
        logger.warn(
          { err: addrErr.message, warehouseId: deployment.warehouse_id },
          "set_warehouse_contract_address rejected"
        );
      }
    }
    await supabase.rpc("update_warehouse_deployment_status", {
      p_deployment_id: deployment.id,
      p_status: "confirmed",
    });
  } else if (outcome.status === "reverted") {
    await supabase.rpc("rollback_warehouse_creation", {
      p_deployment_id: deployment.id,
      p_error: "deployment reverted on-chain",
    });
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

  // Deployment termasuk mutation sensitif fail-closed (TECHSTACK §6.1).
  const rateLimited = await requireRateLimit(
    "warehouse-create",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  if (action === "prepare") {
    const parsed = createWarehousePrepareSchema.safeParse(raw.body);
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

    const owner = await primaryWallet(supabase, auth.user.id);
    if (!owner) return invalid("Connect a wallet before creating a warehouse.");

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

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = Number(parsed.data.expiry);
  if (expiry <= nowSec || expiry > nowSec + DEPLOYMENT_EXPIRY_MAX_SECONDS) {
    return invalid(
      "Your deployment authorization has expired. Retry the create flow."
    );
  }

  const wallet = await primaryWallet(supabase, auth.user.id);
  if (!wallet || wallet.toLowerCase() !== owner.toLowerCase()) {
    return invalid("Sign with your primary wallet.");
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

  if (existing) {
    await finalizeIfMined(supabase, existing);
    // Audit v0.3.2 §2.7: warehouseCode dari request body dapat stale
    // (client lost original) — ambil dari warehouses row, bukan dari
    // parsed.data. Fallback ke body hanya jika DB read gagal (transient).
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("contract_address, warehouse_code")
      .eq("id", existing.warehouse_id)
      .maybeSingle();
    const { data: ws } = warehouse
      ? await supabase
          .from("warehouse_summaries")
          .select("warehouse_code")
          .eq("id", existing.warehouse_id)
          .maybeSingle()
      : { data: null };
    return ok({
      status: existing.status,
      deploymentId: existing.id,
      warehouseId: existing.warehouse_id,
      warehouseCode:
        ws?.warehouse_code ??
        warehouse?.warehouse_code ??
        parsed.data.warehouseCode,
      txHash: existing.tx_hash,
      contractAddress: warehouse?.contract_address ?? null,
    });
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

  // Klaim atomik (write-intent) sebelum relay.
  const { data: created, error: createError } = await supabase.rpc(
    "create_warehouse_and_deployment",
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
    }
  );

  if (createError) {
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

  // Relay via treasury.
  let txHash: Hex;
  try {
    txHash = await relayDeployWarehouse(authTuple, signature);
  } catch (err) {
    logger.error({ err, warehouseId }, "deployWarehouse relay failed");
    await supabase.rpc("rollback_warehouse_creation", {
      p_deployment_id: deploymentId,
      p_error: "relay failed",
    });
    return serverError(
      "Deployment failed to submit. No warehouse was created."
    );
  }

  await supabase.rpc("update_warehouse_deployment_status", {
    p_deployment_id: deploymentId,
    p_status: "submitted",
    p_tx_hash: txHash,
  });

  // Fix A4: JANGAN tunggu receipt di dalam request (melanggar PRD §6.4/§15:
  // "blockchain confirmation async, tidak block request"). Relay 45-90s
  // menyebabkan timeout Vercel Hobby + retry client menumpuk relay.
  // Return 202 segera; client poll dengan idempotencyKey sama →
  // finalizeIfMined menfinalisasi confirmed/reverted saat receipt mined.
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
