import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearOwnershipTransferDraft,
  readOwnershipTransferDraft,
  writeOwnershipTransferDraft,
} from "@/lib/warehouses/ownership-transfer";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ownership transfer browser draft", () => {
  it("round-trips and clears a draft", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    const intent = {
      intentId: "intent-1",
      idempotencyKey: "key-1",
      newOwnerId: "user-2",
      wallet: "0x3333333333333333333333333333333333333333",
      contractAddress: "0x1111111111111111111111111111111111111111",
      generation: "2",
      status: "prepared" as const,
      txHash: null,
      expiresAt: "2026-09-26T00:00:00.000Z",
    };

    const draft = writeOwnershipTransferDraft("warehouse-1", intent);
    expect(readOwnershipTransferDraft("warehouse-1")).toEqual(draft);
    clearOwnershipTransferDraft("warehouse-1");
    expect(readOwnershipTransferDraft("warehouse-1")).toBeNull();
  });

  it("discards drafts older than 24 hours", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const intent = {
      intentId: "intent-1",
      idempotencyKey: "key-1",
      newOwnerId: "user-2",
      wallet: "0x3333333333333333333333333333333333333333",
      contractAddress: "0x1111111111111111111111111111111111111111",
      generation: "2",
      status: "prepared" as const,
      txHash: null,
      expiresAt: "2026-09-26T00:00:00.000Z",
    };

    writeOwnershipTransferDraft("warehouse-1", intent);
    vi.spyOn(Date, "now").mockReturnValue(1000 + 24 * 60 * 60 * 1000 + 1);
    expect(readOwnershipTransferDraft("warehouse-1")).toBeNull();
  });
});
