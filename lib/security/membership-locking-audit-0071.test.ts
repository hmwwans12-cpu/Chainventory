import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "0071_membership_locking_and_audit.sql"
  ),
  "utf8"
);

describe("membership locking and audit (0071, static)", () => {
  it("locks warehouse and membership rows in a deterministic order", () => {
    expect(sql).toContain("perform 1\n  from public.warehouses");
    expect(sql).toContain("order by m.user_id\n  for update;");
    expect(sql).toContain("membership_role_changed");
    expect(sql).toContain("membership_removed");
    expect(sql).toContain("membership_left");
  });

  it("allows Auditor audit-log visibility", () => {
    expect(sql).toContain("in ('OWNER', 'MANAGER', 'AUDITOR')");
    expect(sql).toContain(
      "warehouse owner must have an active OWNER membership"
    );
    expect(sql).toContain("deferrable initially deferred");
  });
});
