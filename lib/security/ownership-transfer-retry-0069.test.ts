import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0069_ownership_transfer_retry_hardening.sql"
    ),
    "utf8"
  );
}

describe("ownership transfer retry hardening (0069, static)", () => {
  it("makes already-transferred confirmations idempotent before owner rejection", () => {
    const sql = migration();
    const ownerRetry = sql.indexOf(
      "v_warehouse.owner_user_id = p_new_owner_id"
    );
    const ownerRejection = sql.indexOf(
      "v_warehouse.owner_user_id is distinct from v_actor_id"
    );

    expect(ownerRetry).toBeGreaterThanOrEqual(0);
    expect(ownerRejection).toBeGreaterThan(ownerRetry);
    expect(sql).toContain("ownership retry is not in a consistent state");
    expect(sql).toContain("for update;");
  });

  it("keeps the service-only grant and locked state transition", () => {
    const sql = migration();
    expect(sql).toContain(
      "revoke all on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) to service_role;"
    );
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("owner_user_id = v_actor_id");
    expect(sql).toContain("role = 'OWNER'");
  });
});
