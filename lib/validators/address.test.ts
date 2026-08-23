import { describe, expect, it } from "vitest";

import {
  addressSchema,
  emptyToNullAddressSchema,
  nullableAddressSchema,
} from "@/lib/validators/address";

const VALID = "0x".concat("Aa".repeat(20));
const LOWER = VALID.toLowerCase();

describe("addressSchema", () => {
  it("accepts a valid address and lowercases deterministically", () => {
    expect(addressSchema.parse(VALID)).toBe(LOWER);
    expect(addressSchema.parse(LOWER)).toBe(LOWER);
  });

  it("rejects invalid addresses", () => {
    expect(addressSchema.safeParse("0x1234").success).toBe(false);
    expect(addressSchema.safeParse("not-an-address").success).toBe(false);
    expect(addressSchema.safeParse("").success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    expect(addressSchema.parse(`  ${VALID}  `)).toBe(LOWER);
  });
});

describe("nullableAddressSchema", () => {
  it("defaults to null and accepts null", () => {
    expect(nullableAddressSchema.parse(undefined)).toBeNull();
    expect(nullableAddressSchema.parse(null)).toBeNull();
  });

  it("accepts a valid address as lowercase", () => {
    expect(nullableAddressSchema.parse(VALID)).toBe(LOWER);
  });
});

describe("emptyToNullAddressSchema", () => {
  it("maps empty string, undefined, and explicit null to null", () => {
    expect(emptyToNullAddressSchema.parse("")).toBeNull();
    expect(emptyToNullAddressSchema.parse(undefined)).toBeNull();
    // Regresi 400 movements: klien mengirim `actorWallet: null` eksplisit
    // saat wallet tidak dipakai — `.optional().default()` lama hanya
    // menolong undefined, sehingga null gagal di pipeline string.
    expect(emptyToNullAddressSchema.parse(null)).toBeNull();
  });

  it("maps a valid address to lowercase", () => {
    expect(emptyToNullAddressSchema.parse(VALID)).toBe(LOWER);
    expect(emptyToNullAddressSchema.parse(` ${VALID} `)).toBe(LOWER);
  });

  it("rejects an invalid non-empty address", () => {
    expect(emptyToNullAddressSchema.safeParse("0xzz").success).toBe(false);
    expect(emptyToNullAddressSchema.safeParse(5).success).toBe(false);
  });
});
