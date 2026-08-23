import { describe, expect, it, vi } from "vitest";

import {
  checkMutationRateLimit,
  RATE_LIMIT_WINDOW_MS,
  type RateLimitStore,
} from "@/lib/security/rate-limit";

/**
 * Unit test core limiter (audit N-2). Redis tidak perlu network —
 * store di-stub; perilaku fail-closed wajib (TECHSTACK §6.1).
 */

function makeStore(overrides?: Partial<RateLimitStore>): RateLimitStore {
  return {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ...overrides,
  };
}

const BASE = {
  action: "stock-movement" as const,
  userId: "u-1",
  ip: "10.0.0.1",
  now: 1_700_000_000_000,
};

describe("checkMutationRateLimit", () => {
  it("fail-closed saat store null (Redis tidak dikonfigurasi)", async () => {
    const decision = await checkMutationRateLimit({
      ...BASE,
      store: null,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it("fail-closed saat Redis error", async () => {
    const store = makeStore({
      incr: vi.fn(async () => {
        throw new Error("upstash timeout");
      }),
    });
    const decision = await checkMutationRateLimit({ ...BASE, store });
    expect(decision.allowed).toBe(false);
  });

  it("allow di bawah limit dan menghitung sisa kuota", async () => {
    let calls = 0;
    const store = makeStore({
      incr: vi.fn(async () => ++calls), // user=1, ip=2
    });
    const decision = await checkMutationRateLimit({ ...BASE, store });
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(Math.min(30 - 1, 120 - 2));
  });

  it("blok saat melewati limit per user", async () => {
    const store = makeStore({ incr: vi.fn(async () => 31) });
    const decision = await checkMutationRateLimit({ ...BASE, store });
    expect(decision.allowed).toBe(false);
  });

  it("blok saat melewati limit per IP meski user masih longgar", async () => {
    const counts = new Map<string, number>();
    const store = makeStore({
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      }),
    });
    // Isi bucket IP sampai melewati batas.
    for (let i = 0; i < 121; i++) {
      await checkMutationRateLimit({ ...BASE, store });
    }
    const last = await checkMutationRateLimit({ ...BASE, store });
    expect(last.allowed).toBe(false);
  });

  it("tanpa IP tetap mengecek dimensi user saja", async () => {
    const keys: string[] = [];
    const store = makeStore({
      incr: vi.fn(async (key: string) => {
        keys.push(key);
        return 1;
      }),
    });
    const decision = await checkMutationRateLimit({ ...BASE, ip: null, store });
    expect(decision.allowed).toBe(true);
    expect(keys.every((k) => k.includes(":user:"))).toBe(true);
  });

  it("resetMs jatuh sebelum window berikutnya", async () => {
    const store = makeStore();
    const decision = await checkMutationRateLimit({ ...BASE, store });
    expect(decision.resetMs).toBeGreaterThan(0);
    expect(decision.resetMs).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS);
  });
});
