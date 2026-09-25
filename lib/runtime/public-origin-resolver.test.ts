import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, unknown>,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import {
  currentRuntimeMode,
  resolvePublicOrigin,
} from "@/lib/runtime/public-origin";

beforeEach(() => {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  mockEnv.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  mockEnv.QSTASH_APP_BASE_URL = undefined;
  mockEnv.VERCEL_URL = undefined;
  mockEnv.VERCEL_ENV = undefined;
  mockEnv.NODE_ENV = "test";
});

describe("runtime public origin", () => {
  it("uses the deployment-specific Vercel origin in preview", () => {
    mockEnv.VERCEL_ENV = "preview";
    mockEnv.VERCEL_URL = "preview.vercel.app";
    mockEnv.NEXT_PUBLIC_APP_URL = "https://production.example.com";
    expect(resolvePublicOrigin()).toBe("https://preview.vercel.app");
    expect(currentRuntimeMode()).toBe("preview");
  });

  it("rejects a preview QStash origin that targets another deployment", () => {
    mockEnv.VERCEL_ENV = "preview";
    mockEnv.VERCEL_URL = "preview.vercel.app";
    mockEnv.QSTASH_APP_BASE_URL = "https://other.example.com";
    expect(() => resolvePublicOrigin()).toThrow(/does not match/);
  });

  it("rejects a production origin that is not public HTTPS", () => {
    mockEnv.VERCEL_ENV = "production";
    mockEnv.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    expect(() => resolvePublicOrigin()).toThrow(/HTTPS/);
  });
});
