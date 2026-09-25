import { createPublicClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  getWarehouseFactory,
  type WarehouseFactoryContract,
} from "@/lib/blockchain/contracts";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { env } from "@/lib/env";

function accountFromEnvironment() {
  const privateKey = env.TREASURY_PRIVATE_KEY;
  if (!privateKey) throw new Error("TREASURY_PRIVATE_KEY not configured");
  const hexKey = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as Hex;
  return privateKeyToAccount(hexKey);
}

export function getTreasuryAccount(
  factory: WarehouseFactoryContract = getWarehouseFactory()
) {
  const account = accountFromEnvironment();
  if (
    factory.proofRecorder &&
    account.address.toLowerCase() !== factory.proofRecorder.toLowerCase()
  ) {
    throw new Error("Treasury signer does not match factory proofRecorder");
  }
  return account;
}

export async function assertLiveFactoryProofRecorder(
  factory: WarehouseFactoryContract = getWarehouseFactory()
): Promise<void> {
  const expected = factory.proofRecorder;
  if (!expected) {
    throw new Error("Factory registry has no proofRecorder");
  }
  const client = createPublicClient({
    chain: baseSepolia,
    transport: createChainTransport(),
  });
  const live = (await client.readContract({
    address: factory.address,
    abi: factory.abi,
    functionName: "proofRecorder",
  })) as string;
  if (live.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Live factory proofRecorder differs from registry");
  }
}

export async function getVerifiedTreasuryAccount(
  factory: WarehouseFactoryContract = getWarehouseFactory()
) {
  await assertLiveFactoryProofRecorder(factory);
  return getTreasuryAccount(factory);
}
