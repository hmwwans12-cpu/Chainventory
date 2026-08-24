import { existsSync } from "node:fs";
import path from "node:path";

import { encodeFunctionData, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { getWarehouseFactory } from "@/lib/blockchain/contracts";

// Artifact forge hanya ada setelah `forge build` — auto-skip di CI.
const FACTORY_ARTIFACT = path.join(
  process.cwd(),
  "contracts",
  "out",
  "WarehouseFactory.sol",
  "WarehouseFactory.json"
);
import {
  buildDeploymentDomain,
  buildDeploymentTypedData,
  DEPLOYMENT_DOMAIN_NAME,
  DEPLOYMENT_DOMAIN_VERSION,
  DEPLOYMENT_PRIMARY_TYPE,
  deploymentErrorMessage,
  deploymentTypes,
  extractDeploymentRevertReason,
  generateWarehouseCode,
  recoverDeploymentSigner,
  verifyDeploymentSignature,
  warehouseCodeHash,
  WAREHOUSE_CODE_RE,
} from "@/lib/warehouses/create";

describe("warehouse code generation", () => {
  it("produces CHV- + 8 karakter dari alfabet aman", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateWarehouseCode());
    expect(seen.size).toBe(200);
    for (const code of seen) expect(code).toMatch(WAREHOUSE_CODE_RE);
  });

  it("deterministik dengan rng yang di-inject", () => {
    const rng = () => "A";
    expect(generateWarehouseCode(rng)).toBe("CHV-AAAAAAAA");
  });
});

describe("warehouse code hash", () => {
  it("keccak256 dari kode sebagai bytes32 0x-hex", () => {
    const code = "CHV-TEST1234";
    const hash = warehouseCodeHash(code);
    expect(hash).toBe(keccak256(toBytes(code)));
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("EIP-712 typed data deployment", () => {
  const factoryAddress = "0x5e44f80585Ec50CBB64a76b3ffD099A156502e10" as Hex;
  const chainId = 84532;

  it("domain separator terikat name/version/chainId/factory (PRD §7.2)", () => {
    const domain = buildDeploymentDomain(factoryAddress, chainId);
    expect(domain.name).toBe(DEPLOYMENT_DOMAIN_NAME);
    expect(domain.version).toBe(DEPLOYMENT_DOMAIN_VERSION);
    expect(domain.chainId).toBe(BigInt(chainId));
    expect(domain.verifyingContract).toBe(factoryAddress);
  });

  it("types persis DeploymentAuthorization(address,bytes32,uint256,uint256)", () => {
    expect(deploymentTypes).toEqual({
      DeploymentAuthorization: [
        { name: "owner", type: "address" },
        { name: "warehouseCodeHash", type: "bytes32" },
        { name: "deploymentNonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ],
    });
  });

  it("typed data lengkap dengan primaryType DeploymentAuthorization", () => {
    const typedData = buildDeploymentTypedData({
      factoryAddress,
      chainId,
      message: {
        owner: "0x0000000000000000000000000000000000000001" as Hex,
        warehouseCodeHash: `0x${"ab".repeat(32)}` as Hex,
        deploymentNonce: "0",
        expiry: "1234567890",
      },
    });
    expect(typedData.primaryType).toBe(DEPLOYMENT_PRIMARY_TYPE);
    expect(typedData.message).toEqual({
      owner: "0x0000000000000000000000000000000000000001",
      warehouseCodeHash: `0x${"ab".repeat(32)}`,
      deploymentNonce: "0",
      expiry: "1234567890",
    });
  });
});

describe("deployment signature", () => {
  const factoryAddress = "0x5e44f80585Ec50CBB64a76b3ffD099A156502e10" as Hex;
  const chainId = 84532;
  const account = privateKeyToAccount(`0x${"11".repeat(32)}`);

  const message = {
    owner: account.address as Hex,
    warehouseCodeHash: `0x${"cd".repeat(32)}` as Hex,
    deploymentNonce: "3",
    expiry: "9999999999",
  };

  function typedData(overrides: Partial<typeof message> = {}) {
    return buildDeploymentTypedData({
      factoryAddress,
      chainId,
      message: { ...message, ...overrides },
    });
  }

  it("sign → verify round-trip (recover == signer)", async () => {
    const signature = await account.signTypedData(typedData());
    expect(await recoverDeploymentSigner(signature, typedData())).toBe(
      account.address.toLowerCase()
    );
    expect(
      await verifyDeploymentSignature(signature, typedData(), account.address)
    ).toBe(true);
  });

  it("message yang diubah → false", async () => {
    const signature = await account.signTypedData(typedData());
    const tampered = typedData({ deploymentNonce: "4" });
    expect(
      await verifyDeploymentSignature(signature, tampered, account.address)
    ).toBe(false);
  });

  it("signer berbeda → false", async () => {
    const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const signature = await account.signTypedData(typedData());
    expect(
      await verifyDeploymentSignature(signature, typedData(), other.address)
    ).toBe(false);
  });

  it("signature sampah → false, tidak melempar", async () => {
    expect(
      await verifyDeploymentSignature(
        `0x${"00".repeat(65)}` as Hex,
        typedData(),
        account.address
      )
    ).toBe(false);
  });
});

describe.skipIf(!existsSync(FACTORY_ARTIFACT))(
  "deployWarehouse calldata (ABI struct + bytes)",
  () => {
    it("selector cocok dengan signature fungsi", () => {
      const factory = getWarehouseFactory();
      const selector = keccak256(
        toBytes("deployWarehouse((address,bytes32,uint256,uint256),bytes)")
      ).slice(0, 10);
      const calldata = encodeFunctionData({
        abi: factory.abi,
        functionName: "deployWarehouse",
        args: [
          {
            owner: "0x0000000000000000000000000000000000000001",
            warehouseCodeHash: `0x${"ef".repeat(32)}` as Hex,
            deploymentNonce: BigInt(0),
            expiry: BigInt(1234567890),
          },
          `0x${"11".repeat(65)}` as Hex,
        ],
      });
      expect(calldata.startsWith(selector)).toBe(true);
    });
  }
);

describe("revert reason mapping (one-active-warehouse ≠ 500 mentah)", () => {
  it("mengenali pesan Factory dan memetakan ke pesan user", () => {
    const err = new Error(
      "The contract function 'deployWarehouse' reverted with the following reason:\nFactory: owner has active warehouse"
    );
    const reason = extractDeploymentRevertReason(err);
    expect(reason).toBe("Factory: owner has active warehouse");
    expect(deploymentErrorMessage(reason)).toContain(
      "already have an active warehouse"
    );
  });

  it("reason tidak dikenal → pesan generik (bukan error mentah)", () => {
    expect(
      deploymentErrorMessage(extractDeploymentRevertReason(new Error("boom")))
    ).toContain("rejected on-chain");
  });
});
