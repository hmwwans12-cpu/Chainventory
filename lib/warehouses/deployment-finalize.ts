import { isAddress, type Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import {
  waitForWarehouseDeployment,
  type DeploymentEventExpectation,
} from "@/lib/warehouses/chain";

type DeploymentRef = {
  id: string;
  status: string;
  tx_hash: string | null;
  warehouse_id: string | null;
};

type DeploymentRow = {
  id: string;
  status: string;
  tx_hash: string | null;
  warehouse_id: string | null;
  owner_address: string;
  warehouse_code_hash: string;
  deployment_nonce: string | number | bigint;
  factory_address: string;
  chain_id: string | number | bigint;
};

type WarehouseAddressRow = {
  contract_address: string | null;
};

function isHexAddress(value: unknown): value is Hex {
  return typeof value === "string" && isAddress(value);
}

function isHexBytes32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}

function toExpectation(
  deployment: DeploymentRow
): DeploymentEventExpectation | null {
  if (
    !isHexAddress(deployment.owner_address) ||
    !isHexBytes32(deployment.warehouse_code_hash) ||
    !isHexAddress(deployment.factory_address)
  ) {
    return null;
  }
  try {
    const deploymentNonce = BigInt(String(deployment.deployment_nonce));
    const chainId = Number(deployment.chain_id);
    if (deploymentNonce < 0n || !Number.isSafeInteger(chainId)) return null;
    return {
      factoryAddress: deployment.factory_address,
      chainId,
      owner: deployment.owner_address,
      warehouseCodeHash: deployment.warehouse_code_hash,
      deploymentNonce,
    };
  } catch {
    return null;
  }
}

async function readDeployment(
  service: SupabaseClient,
  deploymentId: string
): Promise<{ row: DeploymentRow | null; error: string | null }> {
  const { data, error } = await service
    .from("warehouse_deployments")
    .select(
      "id, status, tx_hash, warehouse_id, owner_address, warehouse_code_hash, deployment_nonce, factory_address, chain_id"
    )
    .eq("id", deploymentId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as DeploymentRow | null) ?? null, error: null };
}

async function readWarehouseAddress(
  service: SupabaseClient,
  warehouseId: string
): Promise<{ address: string | null; error: string | null }> {
  const { data, error } = await service
    .from("warehouses")
    .select("contract_address")
    .eq("id", warehouseId)
    .maybeSingle();
  if (error) return { address: null, error: error.message };
  return {
    address: (data as WarehouseAddressRow | null)?.contract_address ?? null,
    error: null,
  };
}

export async function finalizeIfMined(
  _supabase: unknown,
  service: SupabaseClient,
  deployment: DeploymentRef,
  actorUserId: string,
  timeoutMs = 45_000
): Promise<void> {
  const initial = await readDeployment(service, deployment.id);
  if (initial.error || !initial.row) {
    logger.warn(
      { deploymentId: deployment.id, err: initial.error },
      "deployment finalization lookup failed"
    );
    return;
  }
  let first = initial.row;
  if (
    first.status === "pending" &&
    first.tx_hash &&
    /^0x[0-9a-f]{64}$/i.test(first.tx_hash) &&
    first.warehouse_id
  ) {
    const { error: statusError } = await service.rpc(
      "update_warehouse_deployment_status",
      {
        p_deployment_id: first.id,
        p_status: "submitted",
        p_tx_hash: first.tx_hash,
        p_error: null,
        p_actor_user_id: actorUserId,
      }
    );
    if (statusError) {
      logger.warn(
        { deploymentId: first.id, err: statusError.message },
        "pending deployment status recovery failed"
      );
      return;
    }
    const recovered = await readDeployment(service, first.id);
    if (recovered.error || !recovered.row) {
      logger.warn(
        { deploymentId: first.id, err: recovered.error },
        "pending deployment recovery read failed"
      );
      return;
    }
    first = recovered.row;
  }
  if (
    first.status !== "submitted" ||
    !first.tx_hash ||
    !first.warehouse_id ||
    !/^0x[0-9a-f]{64}$/i.test(first.tx_hash)
  ) {
    return;
  }
  const expectation = toExpectation(first);
  if (!expectation) {
    logger.warn(
      { deploymentId: first.id },
      "deployment finalization expectation is invalid"
    );
    return;
  }

  const outcome = await waitForWarehouseDeployment(
    first.tx_hash as Hex,
    expectation,
    timeoutMs
  );
  if (outcome.status === "timeout" || outcome.status === "unverified") {
    return;
  }

  const latest = await readDeployment(service, first.id);
  if (latest.error || !latest.row) {
    logger.warn(
      { deploymentId: first.id, err: latest.error },
      "deployment finalization stale-state lookup failed"
    );
    return;
  }
  if (
    latest.row.status !== "submitted" ||
    !latest.row.tx_hash ||
    latest.row.tx_hash.toLowerCase() !== first.tx_hash.toLowerCase() ||
    !latest.row.warehouse_id ||
    latest.row.warehouse_id.toLowerCase() !== first.warehouse_id.toLowerCase()
  ) {
    return;
  }

  if (outcome.status === "reverted") {
    const { error } = await service.rpc("rollback_warehouse_creation", {
      p_deployment_id: first.id,
      p_error: "deployment reverted on-chain",
      p_actor_user_id: actorUserId,
    });
    if (error) {
      const afterRollback = await readDeployment(service, first.id);
      if (afterRollback.error || afterRollback.row?.status !== "failed") {
        logger.warn(
          { deploymentId: first.id, err: error.message },
          "deployment rollback transition failed"
        );
      }
    }
    return;
  }

  const warehouseBefore = await readWarehouseAddress(
    service,
    latest.row.warehouse_id
  );
  if (warehouseBefore.error) {
    logger.warn(
      { warehouseId: latest.row.warehouse_id, err: warehouseBefore.error },
      "warehouse address lookup failed during deployment finalization"
    );
    return;
  }
  if (
    warehouseBefore.address &&
    warehouseBefore.address.toLowerCase() !==
      outcome.warehouseAddress.toLowerCase()
  ) {
    logger.warn(
      { deploymentId: first.id },
      "deployment address does not match persisted warehouse address"
    );
    return;
  }

  if (!warehouseBefore.address) {
    const { error: addressError } = await service.rpc(
      "set_warehouse_contract_address",
      {
        p_warehouse_id: latest.row.warehouse_id,
        p_contract_address: outcome.warehouseAddress,
        p_actor_user_id: actorUserId,
      }
    );
    if (addressError) {
      const afterAddress = await readWarehouseAddress(
        service,
        latest.row.warehouse_id
      );
      if (
        afterAddress.error ||
        !afterAddress.address ||
        afterAddress.address.toLowerCase() !==
          outcome.warehouseAddress.toLowerCase()
      ) {
        logger.warn(
          { deploymentId: first.id, err: addressError.message },
          "warehouse contract address persistence failed"
        );
        return;
      }
    }
    const persisted = await readWarehouseAddress(
      service,
      latest.row.warehouse_id
    );
    if (
      persisted.error ||
      !persisted.address ||
      persisted.address.toLowerCase() !== outcome.warehouseAddress.toLowerCase()
    ) {
      logger.warn(
        { deploymentId: first.id, err: persisted.error },
        "warehouse contract address could not be verified"
      );
      return;
    }
  }

  const { error: statusError } = await service.rpc(
    "update_warehouse_deployment_status",
    {
      p_deployment_id: first.id,
      p_status: "confirmed",
      p_tx_hash: latest.row.tx_hash,
      p_error: null,
      p_actor_user_id: actorUserId,
    }
  );
  if (statusError) {
    const afterStatus = await readDeployment(service, first.id);
    if (afterStatus.error || afterStatus.row?.status !== "confirmed") {
      logger.warn(
        { deploymentId: first.id, err: statusError.message },
        "warehouse deployment confirmed status transition failed"
      );
    }
  }
}
