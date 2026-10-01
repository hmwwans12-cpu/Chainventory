import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/lib/proof/verify-request", () => ({
  verifyCronSecret: vi.fn(),
}));
vi.mock("@/lib/proof/local-worker", () => ({
  driveLocalProofs: vi.fn(),
}));

import { POST } from "@/app/api/internal/proofs/process-local/route";
import { driveLocalProofs } from "@/lib/proof/local-worker";
import { verifyCronSecret } from "@/lib/proof/verify-request";

const mockCron = vi.mocked(verifyCronSecret);
const mockDrive = vi.mocked(driveLocalProofs);

function request(): Request {
  return new Request("https://example.test/process-local", {
    method: "POST",
    headers: { authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("LOCAL_WORKER_ENABLED", "");
  mockCron.mockResolvedValue(true);
  mockDrive.mockResolvedValue({ ok: true, processed: [], confirmed: [] });
});

describe("process-local route", () => {
  it("drives proofs with cron auth outside production", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mockDrive).toHaveBeenCalledTimes(1);
  });

  it("rejects without cron auth", async () => {
    mockCron.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mockDrive).not.toHaveBeenCalled();
  });

  it("refuses on Vercel production even with cron auth", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mockDrive).not.toHaveBeenCalled();
  });
});
