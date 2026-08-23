import { randomInt } from "node:crypto";

import {
  keccak256,
  recoverTypedDataAddress,
  toBytes,
  type Hex,
  type TypedData,
  type TypedDataDomain,
} from "viem";

/**
 * Create Warehouse authorization (P1 Step 1 sisa) — PRD §6.4/§7, ARSITEKTUR §5.
 *
 * Modul PURE (tanpa network/DB) untuk membangun EIP-712 typed data deployment
 * Warehouse via Factory. Domain separator terikat pada kontrak
 * `EIP712("Chainventory","1")` (name/version/chainId/verifyingContract) dan
 * typehash `DeploymentAuthorization(address owner,bytes32 warehouseCodeHash,
 * uint256 deploymentNonce,uint256 expiry)` — persis dengan `WarehouseFactory.sol`.
 *
 * Server TIDAK pernah menebak deploymentNonce dari DB — selalu baca live dari
 * kontrak (lihat `lib/warehouses/chain.ts`). `idempotencyKey` (DB, TTL 24 jam)
 * terpisah dari `deploymentNonce` (on-chain) — Invariant D (PRD §7.5).
 */

export const DEPLOYMENT_PRIMARY_TYPE = "DeploymentAuthorization";
export const DEPLOYMENT_DOMAIN_NAME = "Chainventory";
export const DEPLOYMENT_DOMAIN_VERSION = "1";

/** TTL authorization yang di-generate `prepare` (detik). */
export const DEPLOYMENT_EXPIRY_SECONDS = 10 * 60;

/** Batas atas expiry yang diterima `submit` (detik dari sekarang). */
export const DEPLOYMENT_EXPIRY_MAX_SECONDS = 30 * 60;

export const WAREHOUSE_CODE_PREFIX = "CHV-";
export const WAREHOUSE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const WAREHOUSE_CODE_LENGTH = 8;
export const WAREHOUSE_CODE_RE = /^CHV-[A-Z2-9]{8}$/;

export type DeploymentAuthorizationMessage = {
  owner: Hex;
  warehouseCodeHash: Hex;
  deploymentNonce: string;
  expiry: string;
};

export const deploymentTypes: TypedData = {
  DeploymentAuthorization: [
    { name: "owner", type: "address" },
    { name: "warehouseCodeHash", type: "bytes32" },
    { name: "deploymentNonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
};

export type DeploymentTypedData = {
  domain: TypedDataDomain;
  types: TypedData;
  primaryType: typeof DEPLOYMENT_PRIMARY_TYPE;
  message: DeploymentAuthorizationMessage;
};

/** Domain separator EIP-712 — harus cocok dengan kontrak (chainId + factory). */
export function buildDeploymentDomain(
  factoryAddress: Hex,
  chainId: number
): TypedDataDomain {
  return {
    name: DEPLOYMENT_DOMAIN_NAME,
    version: DEPLOYMENT_DOMAIN_VERSION,
    chainId: BigInt(chainId),
    verifyingContract: factoryAddress,
  };
}

export function buildDeploymentTypedData(params: {
  factoryAddress: Hex;
  chainId: number;
  message: DeploymentAuthorizationMessage;
}): DeploymentTypedData {
  return {
    domain: buildDeploymentDomain(params.factoryAddress, params.chainId),
    types: deploymentTypes,
    primaryType: DEPLOYMENT_PRIMARY_TYPE,
    message: params.message,
  };
}

/** warehouseCodeHash = keccak256(utf8(warehouse_code)) — binding kode → on-chain. */
export function warehouseCodeHash(code: string): Hex {
  return keccak256(toBytes(code));
}

/**
 * Generate warehouse code non-predictable: `CHV-` + 8 karakter (alfabet tanpa
 * karakter ambigu). Unik dijamin DB (unique index `warehouses_code_idx`).
 * `rng` bisa di-inject untuk tes deterministik.
 */
export function generateWarehouseCode(
  rng: () => string = () =>
    WAREHOUSE_CODE_ALPHABET[randomInt(WAREHOUSE_CODE_ALPHABET.length)]
): string {
  let code = "";
  for (let i = 0; i < WAREHOUSE_CODE_LENGTH; i += 1) code += rng();
  return `${WAREHOUSE_CODE_PREFIX}${code}`;
}

/** Recover signer EIP-712; melempar pada signature invalid/malformed. */
export async function recoverDeploymentSigner(
  signature: Hex,
  typedData: DeploymentTypedData
): Promise<Hex> {
  const recovered = await recoverTypedDataAddress({
    ...typedData,
    signature,
  });
  return recovered.toLowerCase() as Hex;
}

/**
 * Verifikasi signature deployment sebelum diteruskan ke relay (PRD §7.4 no. 4).
 * Tidak melempar — return false untuk signature malformed/berbeda signer.
 */
export async function verifyDeploymentSignature(
  signature: Hex,
  typedData: DeploymentTypedData,
  expectedOwner: Hex
): Promise<boolean> {
  try {
    const recovered = await recoverDeploymentSigner(signature, typedData);
    return recovered.toLowerCase() === expectedOwner.toLowerCase();
  } catch {
    return false;
  }
}

/** Revert reason kanonik dari Factory → pesan user yang jelas. */
export const DEPLOYMENT_REVERT_MESSAGES: Record<string, string> = {
  "Factory: owner has active warehouse":
    "You already have an active warehouse. A warehouse can only be created once per wallet.",
  "Factory: stale nonce":
    "Your deployment authorization is stale. Retry the create flow to sign a fresh one.",
  "Factory: expired":
    "Your deployment authorization has expired. Retry the create flow to sign a fresh one.",
  "Factory: invalid signature": "Invalid signature. Please sign again.",
  "Factory: zero owner": "Invalid owner address.",
};

/** Ekstrak revert reason Factory dari pesan error viem (defensif string match). */
export function extractDeploymentRevertReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const known = Object.keys(DEPLOYMENT_REVERT_MESSAGES).find((key) =>
    message.includes(key)
  );
  return known ?? (message.includes("reverted") ? "reverted" : "unknown");
}

export function deploymentErrorMessage(reason: string): string {
  return (
    DEPLOYMENT_REVERT_MESSAGES[reason] ??
    "Warehouse deployment was rejected on-chain. No warehouse was created."
  );
}
