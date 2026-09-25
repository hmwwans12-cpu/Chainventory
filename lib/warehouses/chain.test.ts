import { describe, expect, it } from "vitest";
import type { Hex } from "viem";

import {
  validateWarehouseDeployedEvent,
  type DeploymentEventExpectation,
} from "@/lib/warehouses/chain";

const expectation: DeploymentEventExpectation = {
  factoryAddress: "0x1111111111111111111111111111111111111111" as Hex,
  chainId: 84532,
  owner: "0x2222222222222222222222222222222222222222" as Hex,
  warehouseCodeHash: `0x${"ab".repeat(32)}` as Hex,
  deploymentNonce: 7n,
};

const event = {
  owner: expectation.owner,
  warehouse: "0x3333333333333333333333333333333333333333",
  warehouseCodeHash: expectation.warehouseCodeHash,
  deploymentNonce: expectation.deploymentNonce,
};

describe("validateWarehouseDeployedEvent", () => {
  it("accepts a matching event and returns its address", () => {
    expect(validateWarehouseDeployedEvent(event, expectation)).toEqual({
      ok: true,
      warehouseAddress: "0x3333333333333333333333333333333333333333",
    });
  });

  it("fails closed when the event is missing or has no address", () => {
    expect(validateWarehouseDeployedEvent(undefined, expectation)).toEqual({
      ok: false,
      reason: "deployment event is missing",
    });
    expect(
      validateWarehouseDeployedEvent(
        { ...event, warehouse: undefined },
        expectation
      )
    ).toEqual({
      ok: false,
      reason: "deployment event address is invalid",
    });
  });

  it("rejects owner, code hash, and nonce mismatches", () => {
    expect(
      validateWarehouseDeployedEvent(
        { ...event, owner: "0x4444444444444444444444444444444444444444" },
        expectation
      ).ok
    ).toBe(false);
    expect(
      validateWarehouseDeployedEvent(
        { ...event, warehouseCodeHash: `0x${"cd".repeat(32)}` },
        expectation
      ).ok
    ).toBe(false);
    expect(
      validateWarehouseDeployedEvent(
        { ...event, deploymentNonce: 8n },
        expectation
      ).ok
    ).toBe(false);
  });

  it("rejects the zero warehouse address", () => {
    expect(
      validateWarehouseDeployedEvent(
        { ...event, warehouse: `0x${"0".repeat(40)}` },
        expectation
      ).ok
    ).toBe(false);
  });
});
