import { describe, expect, it } from "vitest";

import {
  canAssignRole,
  canManageRole,
  hasPermission,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  type Role,
} from "@/lib/auth/permissions";

describe("permissions", () => {
  it("defines all five roles", () => {
    expect(ROLES).toEqual(["OWNER", "MANAGER", "STAFF", "AUDITOR", "VIEWER"]);
  });

  it("grants the owner every permission", () => {
    for (const permission of Object.values(PERMISSIONS)) {
      expect(hasPermission("OWNER", permission)).toBe(true);
    }
  });

  it("allows a viewer read-only access but no mutations", () => {
    expect(hasPermission("VIEWER", PERMISSIONS.INVENTORY_READ)).toBe(true);
    expect(hasPermission("VIEWER", PERMISSIONS.PRODUCT_CREATE)).toBe(false);
    expect(hasPermission("VIEWER", PERMISSIONS.STOCK_OUT)).toBe(false);
  });

  it("does not allow a staff member to manage members", () => {
    expect(hasPermission("STAFF", PERMISSIONS.MEMBER_MANAGE)).toBe(false);
    expect(hasPermission("MANAGER", PERMISSIONS.MEMBER_MANAGE)).toBe(true);
  });

  it("never lets a manager manage MANAGER or OWNER roles", () => {
    expect(canManageRole("MANAGER")).not.toContain("MANAGER");
    expect(canManageRole("MANAGER")).not.toContain("OWNER");
  });

  it("lets an owner manage every role except themselves", () => {
    expect(canManageRole("OWNER")).toEqual([
      "MANAGER",
      "STAFF",
      "AUDITOR",
      "VIEWER",
    ]);
    expect(canManageRole("OWNER")).not.toContain("OWNER");
  });

  it("only allows role assignment when both permission and target role are valid", () => {
    // Manager: has MEMBER_MANAGE, and may assign STAFF/AUDITOR/VIEWER.
    expect(canAssignRole("MANAGER", "STAFF")).toBe(true);
    expect(canAssignRole("MANAGER", "AUDITOR")).toBe(true);
    expect(canAssignRole("MANAGER", "VIEWER")).toBe(true);
    // ...but never MANAGER or OWNER, despite hasPermission being true.
    expect(hasPermission("MANAGER", PERMISSIONS.MEMBER_MANAGE)).toBe(true);
    expect(canAssignRole("MANAGER", "MANAGER")).toBe(false);
    expect(canAssignRole("MANAGER", "OWNER")).toBe(false);
  });

  it("prevents assignment when the actor lacks MEMBER_MANAGE", () => {
    // Staff has no MEMBER_MANAGE, so no assignment at all.
    expect(hasPermission("STAFF", PERMISSIONS.MEMBER_MANAGE)).toBe(false);
    expect(canAssignRole("STAFF", "STAFF")).toBe(false);
    expect(canAssignRole("STAFF", "VIEWER")).toBe(false);
    expect(canAssignRole("STAFF", "AUDITOR")).toBe(false);
  });

  it("lets an owner assign MANAGER but never themself", () => {
    expect(canAssignRole("OWNER", "MANAGER")).toBe(true);
    expect(canAssignRole("OWNER", "STAFF")).toBe(true);
    expect(canAssignRole("OWNER", "OWNER")).toBe(false);
  });

  it("keeps role → permission mapping internally consistent", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS) as [
      Role,
      (typeof ROLE_PERMISSIONS)[Role],
    ][]) {
      for (const permission of permissions) {
        expect(hasPermission(role, permission)).toBe(true);
      }
    }
  });
});
