import { describe, expect, it } from "vitest";

import {
  applyMovementSchema,
  approveAdjustmentSchema,
  archiveProductSchema,
  createProductSchema,
  rejectAdjustmentSchema,
  updateProductSchema,
} from "@/lib/validators/inventory";

const WID = "11111111-1111-4111-8111-111111111111";
const PID = "22222222-2222-4222-8222-222222222222";

describe("inventory validators", () => {
  it("accepts a valid product create", () => {
    expect(
      createProductSchema.safeParse({
        warehouseId: WID,
        sku: "SKU-001",
        name: "Rivets",
        unit: "pcs",
        lowStockThreshold: "5",
      }).success
    ).toBe(true);
  });

  it("rejects blank sku/name/unit", () => {
    expect(
      createProductSchema.safeParse({
        warehouseId: WID,
        sku: " ",
        name: "x",
        unit: "pcs",
      }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        warehouseId: WID,
        sku: "x",
        name: " ",
        unit: "pcs",
      }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        warehouseId: WID,
        sku: "x",
        name: "x",
        unit: " ",
      }).success
    ).toBe(false);
  });

  it("accepts a valid product update", () => {
    expect(
      updateProductSchema.safeParse({
        productId: PID,
        sku: "SKU-002",
        name: "Bolts",
        unit: "box",
      }).success
    ).toBe(true);
  });

  it("accepts archive product", () => {
    expect(
      archiveProductSchema.safeParse({ warehouseId: WID, productId: PID })
        .success
    ).toBe(true);
  });

  it("accepts stock_in movement", () => {
    expect(
      applyMovementSchema.safeParse({
        warehouseId: WID,
        productId: PID,
        movementType: "stock_in",
        quantity: "100.5",
      }).success
    ).toBe(true);
  });

  it("accepts the exact payload sent by movements-client.applyMovement", () => {
    // Regresi 400 Stock In/Out: klien selalu mengirim seluruh field ini,
    // termasuk `actorWallet: null` eksplisit dan string kosong untuk
    // reason/reference. Schema harus menerima bentuk PERSIS ini.
    const parsed = applyMovementSchema.safeParse({
      warehouseId: WID,
      productId: PID,
      movementType: "stock_in",
      quantity: "100",
      expectedBalanceVersion: "4",
      reason: "",
      reference: "",
      reversalOf: null,
      idempotencyKey: "key-1",
      actorWallet: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.actorWallet).toBeNull();
      expect(parsed.data.expectedBalanceVersion).toBe("4");
    }
  });

  it("normalizes a non-empty actor wallet to lowercase", () => {
    const addr = "0x".concat("Bb".repeat(20));
    const parsed = applyMovementSchema.safeParse({
      warehouseId: WID,
      productId: PID,
      movementType: "stock_out",
      quantity: "1",
      actorWallet: addr,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data.actorWallet).toBe(addr.toLowerCase());
  });

  it("rejects zero/negative quantity and >3 decimals", () => {
    expect(
      applyMovementSchema.safeParse({
        warehouseId: WID,
        productId: PID,
        movementType: "stock_out",
        quantity: "0",
      }).success
    ).toBe(false);
    expect(
      applyMovementSchema.safeParse({
        warehouseId: WID,
        productId: PID,
        movementType: "stock_out",
        quantity: "1.0001",
      }).success
    ).toBe(false);
  });

  it("rejects invalid movement type", () => {
    expect(
      applyMovementSchema.safeParse({
        warehouseId: WID,
        productId: PID,
        movementType: "transfer",
        quantity: "1",
      }).success
    ).toBe(false);
  });

  it("accepts reversal with reversalOf uuid", () => {
    expect(
      applyMovementSchema.safeParse({
        warehouseId: WID,
        productId: PID,
        movementType: "reversal",
        quantity: "3",
        reversalOf: "33333333-3333-4333-8333-333333333333",
      }).success
    ).toBe(true);
  });

  it("accepts approve/reject adjustment with uuid", () => {
    expect(approveAdjustmentSchema.safeParse({ movementId: PID }).success).toBe(
      true
    );
    expect(
      rejectAdjustmentSchema.safeParse({ movementId: PID, reason: "nope" })
        .success
    ).toBe(true);
  });

  it("rejects approve adjustment with bad id", () => {
    expect(
      approveAdjustmentSchema.safeParse({ movementId: "abc" }).success
    ).toBe(false);
  });
});
