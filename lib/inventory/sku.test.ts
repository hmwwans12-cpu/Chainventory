import { describe, expect, it, vi } from "vitest";

import {
  generateSkuCandidate,
  generateUniqueSku,
  skuPrefixForName,
} from "@/lib/inventory/sku";

describe("skuPrefixForName", () => {
  it("takes the first 3 alphanumerics uppercased", () => {
    expect(skuPrefixForName("Beras Premium")).toBe("BER");
    expect(skuPrefixForName("gula-aren!")).toBe("GUL");
  });

  it("pads short or empty names with X", () => {
    expect(skuPrefixForName("Oi")).toBe("OIX");
    expect(skuPrefixForName("")).toBe("XXX");
    expect(skuPrefixForName(null)).toBe("XXX");
  });
});

describe("generateSkuCandidate", () => {
  it("is deterministic per (name, seed)", () => {
    expect(generateSkuCandidate("Beras", "key-1")).toBe(
      generateSkuCandidate("Beras", "key-1")
    );
  });

  it("differs across seeds and matches XXX-XXXXXX format", () => {
    const a = generateSkuCandidate("Beras", "key-1");
    const b = generateSkuCandidate("Beras", "key-2");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z0-9]{3}-[A-HJ-NP-Z2-9]{6}$/);
    expect(a).toContain("BER-");
  });
});

describe("generateUniqueSku", () => {
  it("returns the first non-colliding candidate", async () => {
    const exists = vi
      .fn<(sku: string) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const sku = await generateUniqueSku(exists, {
      name: "Beras",
      seed: "key-1",
    });
    expect(sku).toBe(generateSkuCandidate("Beras", "key-1#1"));
    expect(exists).toHaveBeenCalledTimes(2);
  });

  it("falls back to a UUID fragment after repeated collisions", async () => {
    const exists = vi
      .fn<(sku: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    const sku = await generateUniqueSku(exists, { name: "Beras", seed: "k" });
    expect(sku).toMatch(/^SKU-[A-F0-9]{12}$/);
  });
});
