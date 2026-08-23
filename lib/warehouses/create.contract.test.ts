import { randomBytes } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";

import { getWarehouseFactory } from "@/lib/blockchain/contracts";
import {
  buildDeploymentTypedData,
  generateWarehouseCode,
  warehouseCodeHash,
} from "@/lib/warehouses/create";
import {
  readDeploymentNonce,
  readHasActiveWarehouse,
  simulateDeployWarehouse,
} from "@/lib/warehouses/chain";

/**
 * Live on-chain (env-gated, Base Sepolia) — deliverable P1 Step 1:
 *   - nonce deployment dibaca LIVE dari Factory (bukan hardcode — PRD §7.4 no. 1);
 *   - EIP-712 typed data KITA selaras dengan digest kontrak (simulasi
 *     `deployWarehouse` via eth_call — TANPA gas, TANPA state) — signature yang
 *     di-sign `signTypedData` diterima kontrak (recover == owner);
 *   - signature salah ditolak kontrak dengan revert yang jelas.
 *
 *   node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *     lib/warehouses/create.contract.test.ts
 *
 * env: BASE_SEPOLIA_RPC_URL (opsional fallback public sepolia.base.org)
 *
 * Asumsi dari contracts/deployments/base-sepolia.json (smoke test terverifikasi):
 *   owner 0x70E7558d907Ad01540be0639ed809f02bD1d745e memiliki warehouse aktif
 *   0xdF9cA75707f6109d447dA0eE943Ef09733da2926 (nonce = 1).
 */

const DEPLOYED_OWNER = "0x70E7558d907Ad01540be0639ed809f02bD1d745e" as Hex;

const available = Boolean(process.env.BASE_SEPOLIA_RPC_URL);

(available ? describe : describe.skip)(
  "Warehouse factory live (Base Sepolia)",
  () => {
    it("membaca deploymentNonce live dari kontrak (bukan hardcode)", async () => {
      const nonce = await readDeploymentNonce(DEPLOYED_OWNER);
      expect(typeof nonce).toBe("bigint");
      expect(nonce).toBeGreaterThanOrEqual(BigInt(1));
      expect(nonce).toBe(BigInt(1));
    });

    it("hasActiveWarehouse = true untuk owner yang sudah deploy", async () => {
      expect(await readHasActiveWarehouse(DEPLOYED_OWNER)).toBe(true);
    });

    it("hasActiveWarehouse = false untuk address baru acak", async () => {
      const fresh = `0x${"ab".repeat(20)}` as Hex;
      expect(await readHasActiveWarehouse(fresh)).toBe(false);
    });

    it("EIP-712 typed data selaras dengan kontrak (simulasi deploy diterima)", async () => {
      const account = privateKeyToAccount(
        `0x${randomBytes(32).toString("hex")}` as Hex
      );
      const owner = account.address;
      const nonce = await readDeploymentNonce(owner);
      expect(nonce).toBe(BigInt(0));

      const factory = getWarehouseFactory();
      const expiry = Math.floor(Date.now() / 1000) + 600;
      const typedData = buildDeploymentTypedData({
        factoryAddress: factory.address,
        chainId: factory.chainId,
        message: {
          owner,
          warehouseCodeHash: warehouseCodeHash(generateWarehouseCode()),
          deploymentNonce: String(nonce),
          expiry: String(expiry),
        },
      });
      const signature = await account.signTypedData(typedData);

      // eth_call simulasi — TIDAK mengirim tx, TIDAK mengubah state.
      await expect(
        simulateDeployWarehouse(
          {
            owner,
            warehouseCodeHash: typedData.message.warehouseCodeHash,
            deploymentNonce: nonce,
            expiry: BigInt(expiry),
          },
          signature
        )
      ).resolves.toBeUndefined();
    }, 60_000);

    it("signature dari wallet berbeda → simulasi ditolak (invalid signature)", async () => {
      const owner = privateKeyToAccount(
        `0x${randomBytes(32).toString("hex")}` as Hex
      );
      const other = privateKeyToAccount(
        `0x${randomBytes(32).toString("hex")}` as Hex
      );
      const nonce = await readDeploymentNonce(owner.address);

      const factory = getWarehouseFactory();
      const expiry = Math.floor(Date.now() / 1000) + 600;
      const typedData = buildDeploymentTypedData({
        factoryAddress: factory.address,
        chainId: factory.chainId,
        message: {
          owner: owner.address,
          warehouseCodeHash: warehouseCodeHash(generateWarehouseCode()),
          deploymentNonce: String(nonce),
          expiry: String(expiry),
        },
      });
      const badSignature = await other.signTypedData(typedData);

      await expect(
        simulateDeployWarehouse(
          {
            owner: owner.address,
            warehouseCodeHash: typedData.message.warehouseCodeHash,
            deploymentNonce: nonce,
            expiry: BigInt(expiry),
          },
          badSignature
        )
      ).rejects.toThrow(/invalid signature/i);
    }, 60_000);
  }
);

if (!available) {
  describe("Warehouse factory live (skipped)", () => {
    it("needs BASE_SEPOLIA_RPC_URL (opt-in live network test)", () => {
      // Penanda bahwa test di-skip.
    });
  });
}
