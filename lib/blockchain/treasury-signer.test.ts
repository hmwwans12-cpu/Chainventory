import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

const { mockReadContract, privateKey } = vi.hoisted(() => ({
  mockReadContract: vi.fn(),
  privateKey: `0x${"1".repeat(64)}`,
}));
const treasury = privateKeyToAccount(privateKey as `0x${string}`);

vi.mock("@/lib/env", () => ({
  env: { TREASURY_PRIVATE_KEY: privateKey },
}));
vi.mock("@/lib/blockchain/contracts", () => ({
  getWarehouseFactory: vi.fn(),
}));
vi.mock("@/lib/blockchain/chains", () => ({
  baseSepolia: { id: 84532 },
  createChainTransport: () => ({}),
}));
vi.mock("viem", () => ({
  createPublicClient: () => ({ readContract: mockReadContract }),
}));

import {
  getTreasuryAccount,
  getVerifiedTreasuryAccount,
} from "@/lib/blockchain/treasury-signer";

const factory = {
  chainId: 84532,
  address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
  abi: [],
  deploymentBlock: 1,
  version: "1.0.0",
  proofMode: "legacy-v1" as const,
  proofRecorder: treasury.address,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockReadContract.mockResolvedValue(treasury.address);
});

describe("treasury signer verification", () => {
  it("accepts a signer matching registry and live proofRecorder", async () => {
    await expect(getVerifiedTreasuryAccount(factory)).resolves.toMatchObject({
      address: treasury.address,
    });
  });

  it("rejects a registry signer mismatch before broadcasting", () => {
    expect(() =>
      getTreasuryAccount({
        ...factory,
        proofRecorder: "0x2222222222222222222222222222222222222222",
      })
    ).toThrow(/does not match/);
  });

  it("rejects a live proofRecorder mismatch", async () => {
    mockReadContract.mockResolvedValue(
      "0x3333333333333333333333333333333333333333"
    );
    await expect(getVerifiedTreasuryAccount(factory)).rejects.toThrow(
      /differs from registry/
    );
  });
});
