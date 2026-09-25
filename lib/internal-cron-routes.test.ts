import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/proof/verify-request", () => ({
  verifyCronSecret: vi.fn(),
  verifyQStashSignature: vi.fn(),
}));
vi.mock("@/lib/proof/reconcile", () => ({ reconcileProofs: vi.fn() }));
vi.mock("@/lib/warehouses/lifecycle", () => ({
  runWarehouseLifecycle: vi.fn(),
}));

import {
  GET as reconcileGet,
  POST as reconcilePost,
} from "@/app/api/internal/proofs/reconcile/route";
import {
  GET as lifecycleGet,
  POST as lifecyclePost,
} from "@/app/api/internal/warehouses/lifecycle/route";
import { reconcileProofs } from "@/lib/proof/reconcile";
import {
  verifyCronSecret,
  verifyQStashSignature,
} from "@/lib/proof/verify-request";
import { runWarehouseLifecycle } from "@/lib/warehouses/lifecycle";

const mockCron = vi.mocked(verifyCronSecret);
const mockQstash = vi.mocked(verifyQStashSignature);
const mockReconcile = vi.mocked(reconcileProofs);
const mockLifecycle = vi.mocked(runWarehouseLifecycle);

function request(method: string): Request {
  return new Request("https://example.test/cron", {
    method,
    headers: { authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCron.mockResolvedValue(true);
  mockQstash.mockResolvedValue(false);
  mockReconcile.mockResolvedValue({
    ok: true,
    processed: 0,
    republished: [],
    scheduledConfirms: [],
  });
  mockLifecycle.mockResolvedValue({ ok: true, processed: 0, stages: [] });
});

describe("internal cron routes", () => {
  it.each([
    ["GET", reconcileGet],
    ["POST", reconcilePost],
  ] as const)(
    "proof reconcile accepts %s with cron auth",
    async (method, handler) => {
      const response = await handler(request(method));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true });
      expect(mockReconcile).toHaveBeenCalledTimes(1);
    }
  );

  it("proof reconcile keeps QStash authentication on POST", async () => {
    mockCron.mockResolvedValue(false);
    mockQstash.mockResolvedValue(true);

    const response = await reconcilePost(request("POST"));

    expect(response.status).toBe(200);
    expect(mockQstash).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["GET", reconcileGet],
    ["POST", reconcilePost],
  ] as const)(
    "proof reconcile rejects unauthenticated %s",
    async (method, handler) => {
      mockCron.mockResolvedValue(false);
      mockQstash.mockResolvedValue(false);

      const response = await handler(request(method));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "unauthorized",
      });
      expect(mockReconcile).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["GET", lifecycleGet],
    ["POST", lifecyclePost],
  ] as const)(
    "warehouse lifecycle accepts %s with cron auth",
    async (method, handler) => {
      const response = await handler(request(method));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ ok: true });
      expect(mockLifecycle).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["GET", lifecycleGet],
    ["POST", lifecyclePost],
  ] as const)(
    "warehouse lifecycle rejects unauthenticated %s",
    async (method, handler) => {
      mockCron.mockResolvedValue(false);

      const response = await handler(request(method));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "unauthorized",
      });
      expect(mockLifecycle).not.toHaveBeenCalled();
    }
  );
});
