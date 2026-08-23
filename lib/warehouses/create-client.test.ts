import { describe, expect, it, vi } from "vitest";

import {
  prepareDeployment,
  submitDeployment,
  CREATE_WAREHOUSE_ROUTE,
} from "@/lib/warehouses/create-client";

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

const META = {
  name: "Jakarta",
  companyName: "PT Contoh",
  warehouseType: "General storage",
};

describe("create-client", () => {
  it("prepareDeployment posts meta to ?action=prepare and returns data on 200", async () => {
    const data = {
      owner: "0x3426e090d7f232637355ef5dd0f533d9c01c96fa",
      warehouseCode: "CHV-AB2DEF34",
      idempotencyKey: "11111111-2222-3333-4444-555555555555",
      expiresAt: 1786884030,
      deploymentNonce: "0",
      typedData: {
        domain: {
          name: "Chainventory",
          version: "1",
          chainId: "84532",
          verifyingContract: "0x5e44f80585ec50cbb64a76b3ffd099a156502e10",
        },
        types: {
          DeploymentAuthorization: [
            { name: "owner", type: "address" },
            { name: "warehouseCodeHash", type: "bytes32" },
            { name: "deploymentNonce", type: "uint256" },
            { name: "expiry", type: "uint256" },
          ],
        },
        primaryType: "DeploymentAuthorization",
        message: {
          owner: "0x3426e090d7f232637355ef5dd0f533d9c01c96fa",
          warehouseCodeHash: "0x" + "11".repeat(32),
          deploymentNonce: "0",
          expiry: "1786884030",
        },
      },
    };
    const fetcher = mockFetch(200, { ok: true, data });

    const res = await prepareDeployment(META, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      `${CREATE_WAREHOUSE_ROUTE}?action=prepare`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(META),
      })
    );
    expect(res).toEqual({ ok: true, status: 200, data });
  });

  it("prepareDeployment maps 409 CONFLICT (active warehouse) as failure", async () => {
    const fetcher = mockFetch(409, {
      ok: false,
      error: "You already have an active warehouse on-chain.",
      errorCode: "CONFLICT",
    });
    const res = await prepareDeployment(META, fetcher);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.errorCode).toBe("CONFLICT");
      expect(res.error).toMatch(/active warehouse/i);
    }
  });

  it("submitDeployment returns confirmed result on 200", async () => {
    const payload = {
      ...META,
      idempotencyKey: "11111111-2222-3333-4444-555555555555",
      warehouseCode: "CHV-AB2DEF34",
      signature: "0x" + "12".repeat(65),
      owner: "0x3426e090d7f232637355ef5dd0f533d9c01c96fa",
      warehouseCodeHash: "0x" + "11".repeat(32),
      deploymentNonce: "0",
      expiry: "1786884030",
    };
    const data = {
      status: "confirmed",
      warehouseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      deploymentId: "ffffffff-0000-1111-2222-333333333333",
      warehouseCode: "CHV-AB2DEF34",
      contractAddress: "0x721e6ec587a49b2f977431dc253250366b5df11a",
      txHash: "0x" + "ab".repeat(32),
    };
    const fetcher = mockFetch(200, { ok: true, data });

    const res = await submitDeployment(payload, fetcher);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("confirmed");
      expect(res.data.contractAddress).toBe(data.contractAddress);
    }
  });

  it("submitDeployment returns failure with errorCode when rejected", async () => {
    const fetcher = mockFetch(400, {
      ok: false,
      error:
        "Your deployment authorization has expired. Retry the create flow.",
      errorCode: "INVALID_INPUT",
    });
    const res = await submitDeployment({} as never, fetcher);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.errorCode).toBe("INVALID_INPUT");
      expect(res.error).toMatch(/expired/i);
    }
  });

  it("maps non-JSON responses to a generic failure", async () => {
    const fetcher = vi.fn(
      async () => new Response("oops", { status: 500 })
    ) as unknown as typeof fetch;
    const res = await prepareDeployment(META, fetcher);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(500);
      expect(res.error).toBeTruthy();
    }
  });
});
