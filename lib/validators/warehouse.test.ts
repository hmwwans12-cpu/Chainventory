import { describe, expect, it } from "vitest";

import { warehouseLifecycleSchema } from "@/lib/validators/warehouse";

const WID = "11111111-1111-4111-8111-111111111111";

describe("warehouseLifecycleSchema", () => {
  it("accepts suspend/reactivate with a valid warehouse id", () => {
    for (const action of ["suspend", "reactivate"] as const) {
      const parsed = warehouseLifecycleSchema.safeParse({
        warehouseId: WID,
        action,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects bad ids and unknown actions", () => {
    expect(
      warehouseLifecycleSchema.safeParse({
        warehouseId: "x",
        action: "suspend",
      }).success
    ).toBe(false);
    expect(
      warehouseLifecycleSchema.safeParse({ warehouseId: WID, action: "delete" })
        .success
    ).toBe(false);
  });
});
