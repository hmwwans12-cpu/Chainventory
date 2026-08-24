import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getWarehouseFactory } from "@/lib/blockchain/contracts";

// Test ini membaca artifact forge (contracts/out/...) — auto-skip di
// lingkungan tanpa build kontrak (mis. CI) agar suite tetap hijau.
const ABI_ARTIFACT = path.join(
  process.cwd(),
  "contracts",
  "out",
  "WarehouseFactory.sol",
  "WarehouseFactory.json"
);

describe.skipIf(!existsSync(ABI_ARTIFACT))(
  "contract registry (real deploy)",
  () => {
    it("resolves the deployed WarehouseFactory from base-sepolia.json", () => {
      const c = getWarehouseFactory();
      expect(c.chainId).toBe(84532);
      expect(c.address).toBe("0x5e44f80585Ec50CBB64a76b3ffD099A156502e10");
      expect(c.version).toBe("1.0.0");
      expect(c.deploymentBlock).toBe(45470275);
      expect(c.proofRecorder).toBe(
        "0x463841123df8f45F2d58bBFCD276493750Bbf004"
      );
      const fns = c.abi
        .filter((x) => x.type === "function")
        .map((x) => (x as { name: string }).name);
      expect(fns).toContain("deployWarehouse");
      expect(fns).toContain("deploymentNonce");
      expect(fns).toContain("activeWarehouse");
      expect(fns).toContain("proofRecorder");
      expect(fns).toContain("onOwnershipTransfer");
    });
  }
);
