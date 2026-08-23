import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";

import { PROOF_HASH_VERSION, hashProofPayload } from "@/lib/proof/hash";

describe("proof payload hash (JCS + Keccak-256)", () => {
  it("pins Keccak-256 (not SHA-3) via known empty-string digest", () => {
    expect(keccak256(toBytes(""))).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    );
  });

  it("hashes canonical JSON (keys sorted, numeric canonicalized)", () => {
    expect(hashProofPayload({ b: 1, a: 2 })).toBe(
      keccak256(toBytes('{"a":2,"b":1}'))
    );
  });

  it("is deterministic for semantically identical payloads", () => {
    const a = { movementId: "m1", qty: "12", meta: { sku: "A", at: "t" } };
    const b = { meta: { at: "t", sku: "A" }, qty: "12", movementId: "m1" };
    expect(hashProofPayload(a)).toBe(hashProofPayload(b));
  });

  it("treats numeric strings as canonical (no BigInt reachable)", () => {
    const payload = { qty: "0.002", total: "1e+30" };
    expect(hashProofPayload(payload)).toBe(
      keccak256(toBytes('{"qty":"0.002","total":"1e+30"}'))
    );
  });

  it("exposes hash_version = 1", () => {
    expect(PROOF_HASH_VERSION).toBe(1);
  });
});
