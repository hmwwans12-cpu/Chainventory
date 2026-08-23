import { describe, expect, it } from "vitest";

import {
  approveJoinSchema,
  cancelJoinSchema,
  leaveWarehouseSchema,
  rejectJoinSchema,
  removeMemberSchema,
  requestJoinSchema,
} from "@/lib/validators/membership";

describe("membership validators", () => {
  it("accepts a valid warehouse code for request_join", () => {
    expect(
      requestJoinSchema.safeParse({ warehouseCode: "CHV-ABC123" }).success
    ).toBe(true);
  });

  it("rejects an empty warehouse code", () => {
    expect(requestJoinSchema.safeParse({ warehouseCode: "" }).success).toBe(
      false
    );
  });

  it("accepts a valid uuid + role for approve_join", () => {
    expect(
      approveJoinSchema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        role: "STAFF",
      }).success
    ).toBe(true);
  });

  it("rejects approve_join with an invalid role", () => {
    expect(
      approveJoinSchema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        role: "ADMIN",
      }).success
    ).toBe(false);
  });

  it("accepts reject_join with optional reason", () => {
    expect(
      rejectJoinSchema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
        reason: "no need",
      }).success
    ).toBe(true);
    expect(
      rejectJoinSchema.safeParse({
        requestId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true);
  });

  it("rejects cancel_join with a non-uuid id", () => {
    expect(cancelJoinSchema.safeParse({ requestId: "abc" }).success).toBe(
      false
    );
  });

  it("accepts leave_warehouse and remove_member with uuids", () => {
    expect(
      leaveWarehouseSchema.safeParse({
        warehouseId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(true);
    expect(
      removeMemberSchema.safeParse({
        warehouseId: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
      }).success
    ).toBe(true);
  });

  it("rejects remove_member without userId", () => {
    expect(
      removeMemberSchema.safeParse({
        warehouseId: "11111111-1111-4111-8111-111111111111",
      }).success
    ).toBe(false);
  });
});
