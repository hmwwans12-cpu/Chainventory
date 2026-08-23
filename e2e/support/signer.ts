import {
  generatePrivateKey,
  privateKeyToAccount,
  signTypedData,
} from "viem/accounts";
import type { Hex } from "viem";

import { CHAIN_ID, TEST_FACTORY } from "./env";

/**
 * Signer E2E — EOA fiktif (private key random per run, tidak pernah dicetak)
 * yang bertindak sebagai owner/actor on-chain. Wallet ini di-seed ke tabel
 * `wallets` (service-role) sebagai primary wallet user; biaya gas deploy &
 * proof ditanggung treasury relay (production), bukan EOA ini.
 */

export interface E2ESigner {
  address: Hex;
  privateKey: Hex;
}

export function createSigner(): E2ESigner {
  const privateKey = generatePrivateKey();
  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

export const DEPLOYMENT_TYPES = {
  DeploymentAuthorization: [
    { name: "owner", type: "address" },
    { name: "warehouseCodeHash", type: "bytes32" },
    { name: "deploymentNonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
};

export async function signDeployment(
  signer: E2ESigner,
  message: {
    owner: string;
    warehouseCodeHash: string;
    deploymentNonce: string;
    expiry: string;
  }
): Promise<Hex> {
  return signTypedData({
    privateKey: signer.privateKey,
    domain: {
      name: "Chainventory",
      version: "1",
      chainId: BigInt(CHAIN_ID),
      verifyingContract: TEST_FACTORY.address as Hex,
    },
    types: DEPLOYMENT_TYPES,
    primaryType: "DeploymentAuthorization",
    message: {
      owner: message.owner as Hex,
      warehouseCodeHash: message.warehouseCodeHash as Hex,
      deploymentNonce: BigInt(message.deploymentNonce),
      expiry: BigInt(message.expiry),
    },
  } as unknown as Parameters<typeof signTypedData>[0]);
}
