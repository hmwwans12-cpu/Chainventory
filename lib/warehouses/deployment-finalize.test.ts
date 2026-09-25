import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/warehouses/chain", () => ({
  waitForWarehouseDeployment: vi.fn(),
}));

import { finalizeIfMined } from "@/lib/warehouses/deployment-finalize";
import { waitForWarehouseDeployment } from "@/lib/warehouses/chain";

const mockWait = vi.mocked(waitForWarehouseDeployment);

const deployment = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  status: "submitted",
  tx_hash: `0x${"a".repeat(64)}`,
  warehouse_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  owner_address: "0x2222222222222222222222222222222222222222",
  warehouse_code_hash: `0x${"ab".repeat(32)}`,
  deployment_nonce: 7,
  factory_address: "0x1111111111111111111111111111111111111111",
  chain_id: 84532,
};

function makeService(
  options: {
    address?: string | null;
    addressError?: { message: string } | null;
    statusError?: { message: string } | null;
  } = {}
) {
  let currentDeployment = { ...deployment };
  let address = options.address ?? null;
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    const maybeSingle = vi.fn(async () => {
      if (table === "warehouse_deployments") {
        return { data: currentDeployment, error: null };
      }
      return { data: { contract_address: address }, error: null };
    });
    const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    return { select };
  });
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "set_warehouse_contract_address") {
      if (options.addressError)
        return { data: null, error: options.addressError };
      address = String(args.p_contract_address);
      return { data: null, error: null };
    }
    if (fn === "update_warehouse_deployment_status") {
      if (options.statusError)
        return { data: null, error: options.statusError };
      currentDeployment = { ...currentDeployment, status: "confirmed" };
      return { data: currentDeployment, error: null };
    }
    if (fn === "rollback_warehouse_creation") {
      currentDeployment = { ...currentDeployment, status: "failed" };
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
  return {
    service: { from, rpc } as never,
    calls,
    get deployment() {
      return currentDeployment;
    },
    get address() {
      return address;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWait.mockResolvedValue({
    status: "confirmed",
    warehouseAddress: "0x3333333333333333333333333333333333333333",
  });
});

describe("finalizeIfMined", () => {
  it("does not write address or confirmed status for an unverified event", async () => {
    const state = makeService();
    mockWait.mockResolvedValue({
      status: "unverified",
      reason: "deployment event owner does not match",
    });

    await finalizeIfMined(
      {},
      state.service,
      {
        id: deployment.id,
        status: deployment.status,
        tx_hash: deployment.tx_hash,
        warehouse_id: deployment.warehouse_id,
      },
      "actor-1"
    );

    expect(state.calls).toEqual([]);
    expect(state.address).toBeNull();
  });

  it("does not mark confirmed when address persistence fails", async () => {
    const state = makeService({
      addressError: { message: "address write failed" },
    });

    await finalizeIfMined(
      {},
      state.service,
      {
        id: deployment.id,
        status: deployment.status,
        tx_hash: deployment.tx_hash,
        warehouse_id: deployment.warehouse_id,
      },
      "actor-1"
    );

    expect(state.calls.map((call) => call.fn)).toEqual([
      "set_warehouse_contract_address",
    ]);
    expect(state.deployment.status).toBe("submitted");
  });

  it("persists and verifies the event address before confirming", async () => {
    const state = makeService();

    await finalizeIfMined(
      {},
      state.service,
      {
        id: deployment.id,
        status: deployment.status,
        tx_hash: deployment.tx_hash,
        warehouse_id: deployment.warehouse_id,
      },
      "actor-1"
    );

    expect(state.address).toBe("0x3333333333333333333333333333333333333333");
    expect(state.deployment.status).toBe("confirmed");
    expect(state.calls.map((call) => call.fn)).toEqual([
      "set_warehouse_contract_address",
      "update_warehouse_deployment_status",
    ]);
  });

  it("does not claim confirmed state when the status RPC fails", async () => {
    const state = makeService({
      statusError: { message: "status write failed" },
    });

    await finalizeIfMined(
      {},
      state.service,
      {
        id: deployment.id,
        status: deployment.status,
        tx_hash: deployment.tx_hash,
        warehouse_id: deployment.warehouse_id,
      },
      "actor-1"
    );

    expect(state.calls.map((call) => call.fn)).toEqual([
      "set_warehouse_contract_address",
      "update_warehouse_deployment_status",
    ]);
    expect(state.deployment.status).toBe("submitted");
  });

  it("handles a status that becomes stale while waiting for the receipt", async () => {
    const state = makeService();
    mockWait.mockImplementation(async () => {
      state.deployment.status = "confirmed";
      return {
        status: "confirmed",
        warehouseAddress: "0x3333333333333333333333333333333333333333",
      };
    });

    await finalizeIfMined(
      {},
      state.service,
      {
        id: deployment.id,
        status: deployment.status,
        tx_hash: deployment.tx_hash,
        warehouse_id: deployment.warehouse_id,
      },
      "actor-1"
    );

    expect(state.calls).toEqual([]);
  });
});
