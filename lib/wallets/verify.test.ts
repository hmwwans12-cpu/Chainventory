import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  buildVerifyMessage,
  isVerifyMessageFresh,
  parseVerifyMessage,
  recoverVerifyAddress,
  VERIFY_MESSAGE_TTL_MS,
} from "./verify";

const ADDRESS = "0x7432778c871a3760b805c94e2e8d13b6195ac3c4";

describe("buildVerifyMessage / parseVerifyMessage", () => {
  it("round-trips address + timestamp", () => {
    const issued = new Date("2026-09-12T10:00:00.000Z");
    const parsed = parseVerifyMessage(buildVerifyMessage(ADDRESS, issued));
    expect(parsed).toEqual({
      ok: true,
      address: ADDRESS.toLowerCase(),
      issuedAt: issued.getTime(),
    });
  });

  it("rejects tampered messages", () => {
    expect(parseVerifyMessage("hello").ok).toBe(false);
    expect(
      parseVerifyMessage(
        `Chainventory wallet verification\nAddress: 0x123\nIssued at: ${new Date().toISOString()}`
      ).ok
    ).toBe(false);
    expect(
      parseVerifyMessage(
        `EVIL\nAddress: ${ADDRESS}\nIssued at: ${new Date().toISOString()}`
      ).ok
    ).toBe(false);
  });

  it("enforces freshness window", () => {
    const now = Date.now();
    expect(isVerifyMessageFresh(now, now)).toBe(true);
    expect(isVerifyMessageFresh(now - VERIFY_MESSAGE_TTL_MS - 1000, now)).toBe(
      false
    );
    // Clock skew masa depan di luar toleransi ditolak.
    expect(isVerifyMessageFresh(now + 10 * 60 * 1000, now)).toBe(false);
  });
});

describe("recoverVerifyAddress (viem roundtrip)", () => {
  it("recovers the signer address", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildVerifyMessage(account.address, new Date());
    const signature = await account.signMessage({ message });
    const recovered = await recoverVerifyAddress(
      message,
      signature as `0x${string}`
    );
    expect(recovered).toBe(account.address.toLowerCase());
  });

  it("rejects signature for a different message", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const signature = await account.signMessage({ message: "other" });
    const recovered = await recoverVerifyAddress(
      buildVerifyMessage(account.address, new Date()),
      signature as `0x${string}`
    );
    expect(recovered).not.toBe(account.address.toLowerCase());
  });

  it("returns null for garbage signature", async () => {
    const recovered = await recoverVerifyAddress(
      buildVerifyMessage(ADDRESS, new Date()),
      "0x1234" as `0x${string}`
    );
    expect(recovered).toBeNull();
  });
});
